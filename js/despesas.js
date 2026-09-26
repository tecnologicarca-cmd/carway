/* APP_VERSION: v1.2 */
/* =====================================================================
   CARWAY v16 - DESPESAS
   v1.2 (esta versao)
   - NOVO: ícones coloridos em toda a página, seguindo o mesmo padrão já
     usado nas demais páginas do app (Manutenção, Abastecimentos,
     Veículos, Viagens):
       - KPIs: Total (azul), Em viagens (roxo), Dia a dia (verde),
         Despesas/contagem (âmbar).
       - Cada categoria de despesa mantém sua própria cor (já definida
         em CATEGORIAS_DESPESA), agora aplicada também no ícone dentro
         do círculo do card (antes só aparecia colorida na etiqueta de
         categoria, não no ícone principal do card).
       - Botão "Editar" (lista e formulário): ícone azul.
       - Botão "Excluir" (lista): ícone vermelho, mantendo o texto/
         estilo já existente do botão.
   - NOVO: na tela de CADASTRO/EDIÇÃO de despesa, os botões "Cancelar"
     e "Excluir" (este último só aparece quando está EDITANDO uma
     despesa existente) agora usam fundo VERMELHO SÓLIDO com texto/
     ícone BRANCOS, no mesmo padrão arredondado do resto do app —
     antes "Cancelar" usava o estilo neutro padrão do app, e não havia
     nenhum botão de excluir dentro do formulário (só na lista).
   - NOVO: função Despesas.excluirDoForm — usada exclusivamente pelo
     botão "Excluir" dentro do formulário de edição. Funciona igual a
     Despesas.excluir (mesmo modal de confirmação), mas ao concluir
     navega de volta para a lista de despesas (App.irPara('despesas'))
     em vez de tentar atualizar a lista diretamente — necessário porque,
     estando dentro do formulário, o elemento da lista (#listaDespesas)
     não está na tela.
   ===================================================================== */
var CATEGORIAS_DESPESA = [
  { id: 'Alimentação',       icone: 'restaurant',    classe: 'cat-alimentacao',    cor: '#22c55e' },
  { id: 'Hospedagem',        icone: 'hotel',         classe: 'cat-hospedagem',     cor: '#a78bfa' },
  { id: 'Pedágio',           icone: 'toll',          classe: 'cat-pedagio',        cor: '#f59e0b' },
  { id: 'Estacionamento',    icone: 'local_parking', classe: 'cat-estacionamento', cor: '#22d3ee' },
  { id: 'Lavagem',           icone: 'local_car_wash',classe: 'cat-lavagem',        cor: '#06b6d4' },
  { id: 'Manutenção',        icone: 'build',         classe: 'cat-manutencao',     cor: '#ec4899' },
  { id: 'Multa',             icone: 'gavel',         classe: 'cat-multa',          cor: '#ef4444' },
  { id: 'Outros',            icone: 'receipt_long',  classe: 'cat-outros',         cor: '#94a3b8' }
];
var Despesas = {
var Despesas = {
  lista: [],
  veiculos: [],
  viagens: [],
  filtro: 'todos',
  editando: null,
  categoriaSel: 'Alimentação',
  _salvando: false,
  _listenerVeiculoRegistrado: false,
carregarLista: function () {
  var el = document.getElementById('listaDespesas');
  Despesas._registrarListenerVeiculoGlobal();
    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';
    sb.from('despesas')
      .select('*')
      .eq('organizacaoId', orgAtual.id)
      .order('data', { ascending: false })
      .then(function (r) {
        if (r.error) {
          el.innerHTML = '<div class="vazio-veiculo"><p>Erro ao carregar.</p></div>';
          return;
        }
        Despesas.lista = r.data || [];
        Despesas.renderKpis();
        Despesas.renderLista();
      });
  },

   _registrarListenerVeiculoGlobal: function () {
  if (Despesas._listenerVeiculoRegistrado) return;

  if (
    typeof App === 'undefined' ||
    typeof App.aoTrocarVeiculoAtivo !== 'function'
  ) {
    return;
  }

  Despesas._listenerVeiculoRegistrado = true;

  App.aoTrocarVeiculoAtivo(function (veiculoId) {
    var paginaLista = document.getElementById('pg-despesas');

    if (
      paginaLista &&
      paginaLista.classList.contains('ativa')
    ) {
      Despesas.renderKpis();
      Despesas.renderLista();
    }

    var paginaFormulario =
      document.getElementById('pg-despesa-form');

    if (
      paginaFormulario &&
      paginaFormulario.classList.contains('ativa')
    ) {
      var seletor = document.getElementById('dpVeiculo');

      if (
        seletor &&
        veiculoId &&
        seletor.querySelector(
          'option[value="' + veiculoId + '"]'
        )
      ) {
        seletor.value = veiculoId;
      }
    }
  });
},

_listaDoVeiculoAtivo: function () {
  var lista = Despesas.lista || [];

  if (
    typeof App === 'undefined' ||
    !App.veiculoAtivoId
  ) {
    return lista.slice();
  }

  return lista.filter(function (despesa) {
    return despesa.veiculoId === App.veiculoAtivoId;
  });
},
  /* KPIs com ícones coloridos explicitamente, seguindo o mesmo padrão
     já usado em Abastecimentos/Viagens: Total em azul, Em viagens em
     roxo, Dia a dia em verde, contagem em âmbar. */
  renderKpis: function () {
    var total = 0, totalViagem = 0, totalRotina = 0;
    var lista = Despesas._listaDoVeiculoAtivo();
    lista.forEach(function (d) {
      var val = Number(d.valor) || 0;
      total += val;
      if (d.viagemId) totalViagem += val;
      else totalRotina += val;
    });
    var html =
      '<div class="kpi-abast">' +
        '<span class="ms" style="color:#3b82f6">payments</span>' +
        '<b>' + App.moeda(total) + '</b>' +
        '<span class="lbl">Total</span>' +
      '</div>' +
      '<div class="kpi-abast roxo">' +
        '<span class="ms" style="color:#a78bfa">luggage</span>' +
        '<b>' + App.moeda(totalViagem) + '</b>' +
        '<span class="lbl">Em viagens</span>' +
      '</div>' +
      '<div class="kpi-abast verde">' +
        '<span class="ms" style="color:#22c55e">home</span>' +
        '<b>' + App.moeda(totalRotina) + '</b>' +
        '<span class="lbl">Dia a dia</span>' +
      '</div>' +
      '<div class="kpi-abast amarelo">' +
        '<span class="ms" style="color:#f59e0b">receipt_long</span>' +
        '<b>' + lista.length + '</b>' +
        '<span class="lbl">Despesas</span>' +
      '</div>';
    document.getElementById('kpisDesp').innerHTML = html;
  },
  setFiltro: function (f) {
    Despesas.filtro = f;
    var abas = document.querySelectorAll('#pg-despesas .aba-filtro');
    for (var i = 0; i < abas.length; i++) {
      abas[i].classList.toggle('sel', abas[i].dataset.filtro === f);
    }
    Despesas.renderLista();
  },
  renderLista: function () {
    var el = document.getElementById('listaDespesas');
    var lista = Despesas._listaDoVeiculoAtivo();
    if (Despesas.filtro === 'viagem') lista = lista.filter(function (d) { return !!d.viagemId; });
    else if (Despesas.filtro === 'rotina') lista = lista.filter(function (d) { return !d.viagemId; });
    if (lista.length === 0) {
      el.innerHTML =
        '<div class="vazio-veiculo">' +
          '<span class="ms">receipt_long</span>' +
          '<b>Nenhuma despesa</b>' +
          '<p>' + (Despesas.filtro === 'todos'
            ? 'Registre sua primeira despesa.'
            : 'Nenhum registro nesse filtro.') + '</p>' +
          '<button class="btn-novo" onclick="App.irParaFormDespesa()">' +
            '<span class="ms">add</span> Nova despesa' +
          '</button>' +
        '</div>';
      return;
    }
    el.innerHTML = lista.map(Despesas.cardHTML).join('');
  },
  /* Card da lista: ícone da categoria agora recebe a cor própria dela
     também inline (garantindo a cor mesmo que a classe CSS da
     categoria não a defina), e os botões Editar/Excluir ganham ícones
     coloridos (azul/vermelho) — mesmo padrão usado nas outras páginas. */
  cardHTML: function (d) {
    var cat = Despesas.getCategoria(d.categoria);
    var valor = Number(d.valor) || 0;
    var data = Despesas.fmtData(d.data);
    var detalhes = [];
    if (d.local) detalhes.push(d.local);
    if (d.viagemId) detalhes.push('Viagem');
    return '<div class="card-desp">' +
      '<div class="cd-topo">' +
        '<div class="cat-ico ' + cat.classe + '" style="background:' + cat.cor + '22;color:' + cat.cor + '">' +
          '<span class="ms" style="color:' + cat.cor + '">' + cat.icone + '</span>' +
        '</div>' +
        '<div class="cd-info">' +
          '<b>' + App.esc(d.descricao || cat.id) + '</b>' +
          '<small>' + App.esc(data) + (detalhes.length ? ' · ' + App.esc(detalhes.join(' · ')) : '') + '</small>' +
          '<span class="cd-cat-tag" style="background:' + cat.cor + '22;color:' + cat.cor + '">' +
            '<span class="ms" style="font-size:13px">' + cat.icone + '</span>' + cat.id +
          '</span>' +
        '</div>' +
        '<div class="cd-valor">' + App.moeda(valor) + '</div>' +
      '</div>' +
      '<div class="acoes-abast">' +
        '<button onclick="App.irParaFormDespesa(\'' + d.id + '\')">' +
          '<span class="ms" style="color:#60a5fa">edit</span> Editar' +
        '</button>' +
        '<button class="excluir" onclick="Despesas.excluir(\'' + d.id + '\')">' +
          '<span class="ms" style="color:#ef4444">delete</span> Excluir' +
        '</button>' +
      '</div>' +
    '</div>';
  },
  abrirForm: function (id) {
  var consultas = [
    sb.from('veiculos')
      .select('id, nome, placa')
      .eq('organizacaoId', orgAtual.id)
      .order('nome'),

    sb.from('viagens')
      .select('id, titulo, destino, status')
      .eq('organizacaoId', orgAtual.id)
      .neq('status', 'concluida')
      .order('dataInicio', { ascending: false })
  ];

  if (id) {
    consultas.push(
      sb.from('despesas')
        .select('*')
        .eq('id', id)
        .eq('organizacaoId', orgAtual.id)
        .single()
    );
  }

  Promise.all(consultas)
    .then(function (resultados) {
      var resultadoVeiculos = resultados[0];
      var resultadoViagens = resultados[1];
      var resultadoDespesa = id ? resultados[2] : null;

      if (
        resultadoVeiculos.error ||
        !resultadoVeiculos.data ||
        resultadoVeiculos.data.length === 0
      ) {
        App.abrirModal(
          'Veículo necessário',

          '<div style="text-align:center;padding:10px 0">' +
            '<span class="ms" style="font-size:56px;color:var(--txt2);opacity:0.5">' +
              'directions_car' +
            '</span>' +

            '<h3 style="margin:16px 0 10px">' +
              'Cadastre um veículo primeiro' +
            '</h3>' +

            '<p style="color:var(--txt2);font-size:14px;line-height:1.6;margin:0 0 20px">' +
              'Para lançar despesas, você precisa cadastrar pelo menos um veículo.' +
            '</p>' +
          '</div>',

          function () {
            App.fecharModal();
            App.irParaFormVeiculo();
          },

          'Cadastrar veículo'
        );

        return;
      }

      if (resultadoViagens.error) {
        console.error(
          'CarWay despesas - erro ao carregar viagens:',
          resultadoViagens.error
        );
      }

      Despesas.veiculos = resultadoVeiculos.data || [];
      Despesas.viagens = resultadoViagens.error
        ? []
        : (resultadoViagens.data || []);

      if (id) {
        if (
          !resultadoDespesa ||
          resultadoDespesa.error ||
          !resultadoDespesa.data
        ) {
          console.error(
            'CarWay despesas - erro ao carregar despesa:',
            resultadoDespesa && resultadoDespesa.error
          );

          App.toast('Despesa não encontrada', 'erro');
          App.irPara('despesas');
          return;
        }

        Despesas.editando = resultadoDespesa.data;

        Despesas.categoriaSel =
          resultadoDespesa.data.categoria || 'Alimentação';
      } else {
        Despesas.editando = null;
        Despesas.categoriaSel = 'Alimentação';
      }

      Despesas.renderForm();
    })
    .catch(function (erro) {
      console.error(
        'CarWay despesas - erro ao abrir formulário:',
        erro
      );

      App.toast(
        'Não foi possível abrir o cadastro de despesa',
        'erro'
      );

      App.irPara('despesas');
    });
},
  /* Categorias do formulário: cada botão de categoria ganha a cor
     própria (borda/ícone) mesmo quando não selecionado, para ficar
     visualmente consistente com o card da lista e com o restante do
     app (cada categoria sempre com sua cor, não só quando ativa). */
  renderForm: function () {
    var d = Despesas.editando || {};
    var veiculos = Despesas.veiculos;
    var veiculoGlobalValido =
  App.veiculoAtivoId &&
  veiculos.some(function (v) {
    return v.id === App.veiculoAtivoId;
  });

var vSel =
  d.veiculoId ||
  (veiculoGlobalValido
    ? App.veiculoAtivoId
    : veiculos[0].id);
    var dataHoje = App.hojeISO();
    var veicOpts = veiculos.map(function (v) {
      return '<option value="' + v.id + '"' + (v.id === vSel ? ' selected' : '') + '>' +
        App.esc(v.nome) + (v.placa ? ' · ' + App.esc(v.placa) : '') + '</option>';
    }).join('');
    var viagOpts = '<option value="">— Nenhuma (gasto do dia a dia) —</option>' +
      Despesas.viagens.map(function (v) {
        return '<option value="' + v.id + '"' + (v.id === d.viagemId ? ' selected' : '') + '>' +
          App.esc(v.titulo || v.destino || 'Viagem') + '</option>';
      }).join('');
    var catsHtml = CATEGORIAS_DESPESA.map(function (c) {
      var sel = c.id === Despesas.categoriaSel;
      return '<button type="button" class="cat-opcao' + (sel ? ' sel' : '') + '" ' +
        'data-cat="' + c.id + '" onclick="Despesas.selCat(this)" ' +
        'style="' + (sel ? 'border-color:' + c.cor + ';background:' + c.cor + '1a' : '') + '">' +
        '<span class="ms" style="color:' + c.cor + '">' + c.icone + '</span>' +
        '<span>' + c.id + '</span>' +
      '</button>';
    }).join('');
    var html =
      '<h2 class="form-titulo">' + (d.id ? 'Editar despesa' : 'Nova despesa') + '</h2>' +
      '<div class="campo-form"><label>Veículo</label>' +
        '<select id="dpVeiculo">' + veicOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Categoria</label>' +
        '<div class="cats-grid" id="catsGrid">' + catsHtml + '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Descrição</label>' +
        '<input type="text" id="dpDescricao" placeholder="Ex: Almoco na estrada" value="' + App.esc(d.descricao || '') + '" maxlength="100">' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Valor</label>' +
          '<input type="number" id="dpValor" step="0.01" placeholder="0,00" value="' + (d.valor || '') + '">' +
        '</div>' +
        '<div class="campo-form"><label>Data</label>' +
          '<input type="date" id="dpData" value="' + (d.data || dataHoje) + '">' +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Local</label>' +
        '<input type="text" id="dpLocal" placeholder="Cidade, restaurante, posto..." value="' + App.esc(d.local || '') + '">' +
      '</div>' +
      '<div class="campo-form"><label>Vincular a viagem (opcional)</label>' +
        '<select id="dpViagem">' + viagOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Observações</label>' +
        '<textarea id="dpObs" rows="2" style="width:100%;background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;color:var(--txt);font-family:inherit;font-size:14px;resize:vertical">' + App.esc(d.obs || '') + '</textarea>' +
      '</div>' +
      /* Botões: Cancelar (e Excluir, se for edição) agora em vermelho
         sólido com texto/ícone brancos, mesmo padrão arredondado do
         resto do app. "Salvar alterações"/"Registrar despesa"
         permanece com o estilo padrão (gradiente) já existente. */
      '<div class="form-acoes">' +
        '<button style="background:#ef4444;color:#fff;border:0;border-radius:12px;padding:13px 18px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px" ' +
          'onclick="App.irPara(\'despesas\')">' +
          '<span class="ms" style="color:#fff;font-size:18px">arrow_back</span> Cancelar' +
        '</button>' +
        (d.id
          ? '<button style="background:#ef4444;color:#fff;border:0;border-radius:12px;padding:13px 18px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px" ' +
              'onclick="Despesas.excluirDoForm(\'' + d.id + '\')">' +
              '<span class="ms" style="color:#fff;font-size:18px">delete</span> Excluir' +
            '</button>'
          : '') +
        '<button class="btn-salvar-form" id="btnSalvarDp" onclick="Despesas.salvar()">' +
          (d.id ? 'Salvar alterações' : 'Registrar despesa') +
        '</button>' +
      '</div>';
    document.getElementById('formDespesaContainer').innerHTML = html;
  },
  selCat: function (el) {
    var ops = document.querySelectorAll('#catsGrid .cat-opcao');
    for (var i = 0; i < ops.length; i++) {
      ops[i].classList.remove('sel');
      ops[i].style.borderColor = '';
      ops[i].style.background = '';
    }
    el.classList.add('sel');
    var cor = Despesas.getCategoria(el.getAttribute('data-cat')).cor;
    el.style.borderColor = cor;
    el.style.background = cor + '1a';
    Despesas.categoriaSel = el.getAttribute('data-cat');
  },
  salvar: function () {
    if (Despesas._salvando) return;
    var veiculoId = document.getElementById('dpVeiculo').value;
    var valor = Number(document.getElementById('dpValor').value) || 0;
    if (!veiculoId) { App.toast('Escolha o veiculo', 'erro'); return; }
    if (valor <= 0) { App.toast('Informe o valor', 'erro'); return; }
    Despesas._salvando = true;
    var viagemId = document.getElementById('dpViagem').value;
    viagemId = (viagemId && viagemId.trim()) ? viagemId : null;
    var reg = {
      organizacaoId: orgAtual.id,
      usuarioId: usuarioAtual.id,
      veiculoId: veiculoId,
      viagemId: viagemId,
      data: document.getElementById('dpData').value,
      categoria: Despesas.categoriaSel,
      descricao: document.getElementById('dpDescricao').value.trim(),
      valor: valor,
      local: document.getElementById('dpLocal').value.trim(),
      obs: document.getElementById('dpObs').value.trim()
    };
    var btn = document.getElementById('btnSalvarDp');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    var promise;
    if (Despesas.editando && Despesas.editando.id) {
      promise = sb.from('despesas').update(reg).eq('id', Despesas.editando.id);
    } else {
      reg.id = 'DES_' + App.uid();
      promise = sb.from('despesas').insert(reg);
    }
    promise.then(function (r) {
      Despesas._salvando = false;
      btn.disabled = false;
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        btn.textContent = Despesas.editando ? 'Salvar alterações' : 'Registrar despesa';
        return;
      }
      App.toast(Despesas.editando ? 'Atualizado!' : 'Despesa registrada!', 'ok');
      App.irPara('despesas');
    }).catch(function (e) {
      Despesas._salvando = false;
      btn.disabled = false;
      App.toast('Erro: ' + (e.message || 'desconhecido'), 'erro');
    });
  },
  /* Excluir a partir da LISTA (mantém a lista carregada na tela). */
  excluir: function (id) {
    var d = Despesas.lista.filter(function (x) { return x.id === id; })[0] || {};
    var cat = Despesas.getCategoria(d.categoria);
    var desc = d.descricao || cat.id;
    App.confirmar({
      titulo: 'Excluir despesa',
      mensagem: 'A despesa <b>' + App.esc(desc) + '</b> de <b>' + App.moeda(d.valor) + '</b> será excluída permanentemente.',
      textoBotao: 'Excluir despesa',
      tipo: 'perigo',
      icone: 'receipt_long',
      aoConfirmar: function () {
        sb.from('despesas').delete().eq('id', id).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Despesa excluída', 'ok');
          Despesas.carregarLista();
        });
      }
    });
  },
  /* Excluir a partir do FORMULÁRIO de edição — usada pelo novo botão
     "Excluir" (vermelho) dentro da tela de editar despesa. Diferente
     de Despesas.excluir: ao concluir, navega de volta para a lista
     (App.irPara('despesas'), que já chama Despesas.carregarLista())
     em vez de tentar atualizar a lista diretamente — necessário pois,
     estando no formulário, o elemento #listaDespesas não está na tela. */
  excluirDoForm: function (id) {
    var d = Despesas.editando || {};
    var cat = Despesas.getCategoria(d.categoria);
    var desc = d.descricao || cat.id;
    App.confirmar({
      titulo: 'Excluir despesa',
      mensagem: 'A despesa <b>' + App.esc(desc) + '</b> de <b>' + App.moeda(d.valor) + '</b> será excluída permanentemente.',
      textoBotao: 'Excluir despesa',
      tipo: 'perigo',
      icone: 'receipt_long',
      aoConfirmar: function () {
        sb.from('despesas').delete().eq('id', id).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Despesa excluída', 'ok');
          App.irPara('despesas');
        });
      }
    });
  },
  getCategoria: function (id) {
    for (var i = 0; i < CATEGORIAS_DESPESA.length; i++) {
      if (CATEGORIAS_DESPESA[i].id === id) return CATEGORIAS_DESPESA[i];
    }
    return CATEGORIAS_DESPESA[CATEGORIAS_DESPESA.length - 1];
  },
  fmtData: function (s) {
    if (!s) return '—';
    var p = String(s).substring(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s;
  }
};
