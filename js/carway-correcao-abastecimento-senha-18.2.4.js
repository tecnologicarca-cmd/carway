/* CARWAY 18.2.4 - Correcao emergencial
   1) salvamento de abastecimentos online/offline com erro visivel
   2) botao mostrar/ocultar senha em login, cadastro e redefinicao
*/
(function () {
  'use strict';

  function toast(msg, tipo) {
    if (window.App && App.toast) App.toast(msg, tipo || 'ok');
    else alert(msg);
  }

  function textoErro(e) {
    if (!e) return 'Erro desconhecido';
    return e.message || e.details || e.hint || String(e);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function instalarOlho(inputId) {
    var input = document.getElementById(inputId);
    if (!input || input.dataset.cwOlho === '1') return;
    input.dataset.cwOlho = '1';

    var pai = document.createElement('div');
    pai.className = 'cw-senha-wrap';
    input.parentNode.insertBefore(pai, input);
    pai.appendChild(input);

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'cw-senha-toggle';
    botao.setAttribute('aria-label', 'Mostrar senha');
    botao.setAttribute('title', 'Mostrar senha');
    botao.innerHTML = '<span class="ms">visibility</span>';
    botao.addEventListener('click', function () {
      var mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      botao.innerHTML = '<span class="ms">' + (mostrar ? 'visibility_off' : 'visibility') + '</span>';
      botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      botao.setAttribute('title', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
    });
    pai.appendChild(botao);
  }

  function instalarIconesSenha() {
    ['senha', 'cadSenha', 'nsSenha', 'nsSenha2'].forEach(instalarOlho);
  }

  async function salvarAbastecimentoCorrigido() {
    var A = window.Abastecimentos;
    if (!A) return;
    if (A._cwSalvando) return;

    var campo = function (id) { return document.getElementById(id); };
    var veiculoEl = campo('abVeiculo');
    var dataEl = campo('abData');
    var kmEl = campo('abKm');
    var qtdEl = campo('abLitros');
    var precoEl = campo('abPreco');
    var totalEl = campo('abTotal');
    var postoEl = campo('abPosto');
    var obsEl = campo('abObs');
    var viagemEl = campo('abViagem');
    var botao = campo('btnSalvarAb');

    if (!veiculoEl || !dataEl || !qtdEl || !precoEl || !totalEl || !botao) {
      toast('O formulario de abastecimento nao foi carregado corretamente.', 'erro');
      return;
    }

    var veiculoId = veiculoEl.value;
    var quantidade = Number(qtdEl.value) || 0;
    var preco = Number(precoEl.value) || 0;
    var total = Number(totalEl.value) || 0;
    var km = Number(kmEl && kmEl.value) || 0;

    if (!veiculoId) { toast('Selecione o veiculo.', 'erro'); return; }
    if (!dataEl.value) { toast('Informe a data.', 'erro'); return; }
    if (quantidade <= 0) { toast('Informe a quantidade abastecida.', 'erro'); return; }
    if (total <= 0 && preco <= 0) { toast('Informe o preco ou o valor total.', 'erro'); return; }
    if (total <= 0) total = Number((quantidade * preco).toFixed(2));
    if (preco <= 0) preco = Number((total / quantidade).toFixed(3));

    var idEdicao = A.editando && A.editando.id ? A.editando.id : null;
    var textoBotao = idEdicao ? 'Salvar alteracoes' : 'Registrar abastecimento';

    A._cwSalvando = true;
    botao.disabled = true;
    botao.textContent = navigator.onLine ? 'Salvando...' : 'Salvando no aparelho...';

    try {
      var ultimoKm = null;
      if (A.buscarUltimoKmVeiculo) ultimoKm = await A.buscarUltimoKmVeiculo(veiculoId, idEdicao);
      /* KM igual e permitido: pode haver mais de um abastecimento sem deslocamento.
         So bloqueamos KM realmente regressivo. */
      if (ultimoKm !== null && km > 0 && km < ultimoKm) {
        throw new Error('KM informado (' + km + ') e menor que o ultimo abastecimento (' + ultimoKm + ' km).');
      }

      var energetico = A._energeticoFormAtual ? A._energeticoFormAtual() : 'Gasolina';
      var unidade = A._unidadePorCombustivel ? A._unidadePorCombustivel(energetico).sigla : 'L';
      var tipoLancamento = (A._form && A._form.tipoLancamento) || 'diaadia';
      var nivel = (A._form && Number(A._form.nivelTanque)) || 100;
      var registro = {
        organizacaoId: window.orgAtual && orgAtual.id,
        usuarioId: window.usuarioAtual && usuarioAtual.id,
        veiculoId: veiculoId,
        viagemId: tipoLancamento === 'viagem' && viagemEl && viagemEl.value ? viagemEl.value : null,
        data: dataEl.value,
        km: km,
        litros: quantidade,
        precoLitro: preco,
        valorTotal: total,
        posto: postoEl ? postoEl.value.trim() : '',
        combustivel: energetico,
        unidade: unidade,
        tanqueCheio: nivel === 100 ? 'SIM' : 'NAO',
        nivelTanque: nivel,
        obs: obsEl ? obsEl.value.trim() : ''
      };

      if (!registro.organizacaoId || !registro.usuarioId) {
        throw new Error('Sessao incompleta. Saia da conta, entre novamente e tente salvar.');
      }

      var resultado;
      if (!navigator.onLine) {
        if (!window.Offline || typeof Offline.salvar !== 'function') {
          throw new Error('Armazenamento offline indisponivel neste aparelho.');
        }
        if (!idEdicao) registro.id = 'ABS_' + (App.uid ? App.uid() : Date.now());
        resultado = await Offline.salvar({
          tabela: 'abastecimentos',
          operacao: idEdicao ? 'update' : 'insert',
          registro: registro,
          registroId: idEdicao || registro.id,
          filtros: idEdicao ? { id: idEdicao } : {},
          metadados: { modulo: 'abastecimentos', veiculoId: veiculoId, viagemId: registro.viagemId }
        });
      } else {
        var resposta;
        if (idEdicao) {
          resposta = await sb.from('abastecimentos')
            .update(registro)
            .eq('id', idEdicao)
            .eq('organizacaoId', registro.organizacaoId)
            .select('id')
            .maybeSingle();
        } else {
          registro.id = 'ABS_' + (App.uid ? App.uid() : Date.now());
          resposta = await sb.from('abastecimentos')
            .insert(registro)
            .select('id')
            .single();
        }
        resultado = { error: resposta.error || null, data: resposta.data || null, pendente: false };
      }

      if (resultado && resultado.error) throw resultado.error;

      if (resultado && resultado.pendente) {
        toast('Abastecimento salvo no aparelho e aguardando sincronizacao.', 'ok');
      } else {
        toast(idEdicao ? 'Abastecimento atualizado!' : 'Abastecimento registrado!', 'ok');
      }

      A.editando = null;
      if (window.App && App._painelRaw) App._painelRaw = null;
      if (window.App && App._alertasCache) App._alertasCache = null;
      if (window.App && App.irPara) App.irPara('abastecimentos');
    } catch (e) {
      console.error('CarWay abastecimento - falha ao salvar:', e);
      toast('Nao foi possivel salvar: ' + textoErro(e), 'erro');
    } finally {
      A._cwSalvando = false;
      botao.disabled = false;
      botao.textContent = textoBotao;
    }
  }

  function instalarCorrecaoAbastecimento() {
    if (!window.Abastecimentos || Abastecimentos._cwCorrecao184) return;
    Abastecimentos._cwCorrecao184 = true;

    Abastecimentos._executarSalvar = salvarAbastecimentoCorrigido;
    Abastecimentos.validarESalvar = function () {
      var qtd = Number((document.getElementById('abLitros') || {}).value) || 0;
      if (qtd <= 0) { toast('Informe a quantidade abastecida.', 'erro'); return; }
      var km = Number((document.getElementById('abKm') || {}).value) || 0;
      if (km > 0) { salvarAbastecimentoCorrigido(); return; }
      if (window.App && App.confirmar) {
        App.confirmar({
          titulo: 'Salvar sem o KM do painel?',
          mensagem: 'Sem o KM, os alertas por quilometragem podem ficar menos precisos.',
          textoBotao: 'Salvar mesmo assim',
          tipo: 'aviso',
          icone: 'speed',
          aoConfirmar: salvarAbastecimentoCorrigido
        });
      } else salvarAbastecimentoCorrigido();
    };
  }

  function iniciar() {
    var estilo = document.createElement('style');
    estilo.id = 'cw-correcao-18-2-4-style';
    estilo.textContent =
      '.cw-senha-wrap{position:relative;display:flex;align-items:center;width:100%}' +
      '.cw-senha-wrap>input{width:100%;padding-right:48px!important;box-sizing:border-box}' +
      '.cw-senha-toggle{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:40px;height:40px;' +
      'display:grid;place-items:center;border:0;background:transparent;color:var(--txt2,#93a4c8);cursor:pointer;border-radius:9px}' +
      '.cw-senha-toggle:hover,.cw-senha-toggle:focus{background:rgba(96,165,250,.12);color:#60a5fa;outline:none}' +
      '.cw-senha-toggle .ms{font-size:21px}';
    document.head.appendChild(estilo);
    instalarIconesSenha();
    instalarCorrecaoAbastecimento();
    /* As telas ja existem, mas o observador garante o olho se algum formulario for recriado. */
    new MutationObserver(function () { instalarIconesSenha(); }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
