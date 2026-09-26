/* APP_VERSION: v1.0 */

/* =====================================================================
   CARWAY - CONTA (Meu perfil + Meu plano)
   Usado pela página de Configurações, igual para todo mundo
   (usuário comum ou master).

   IMPORTANTE — PLACEHOLDER DE PREÇOS:
   Os valores e benefícios em PLANOS_INFO abaixo são um EXEMPLO/RASCUNHO.
   Não tenho acesso aos valores reais que você pratica — ajuste os
   campos "preco" e "beneficios" de cada plano para refletir sua
   tabela de preços real antes de publicar.
   ===================================================================== */

var PLANOS_INFO = [
  {
    id: 'FREE',
    nome: 'Free',
    preco: 'Grátis',
    maxVeiculos: 1,
    maxUsuarios: 1,
    beneficios: ['1 veículo', '1 usuário', 'Abastecimentos e despesas', 'Manutenção básica']
  },
  {
    id: 'FAMILIAR',
    nome: 'Familiar',
    preco: 'R$ 19,90/mês',
    maxVeiculos: 3,
    maxUsuarios: 5,
    beneficios: ['Até 3 veículos', 'Até 5 membros na equipe', 'Alertas de revisão', 'Documentos com vencimento']
  },
  {
    id: 'FAMILIAR_PREMIUM',
    nome: 'Familiar Premium',
    preco: 'R$ 29,90/mês',
    maxVeiculos: 6,
    maxUsuarios: 10,
    beneficios: ['Até 6 veículos', 'Até 10 membros na equipe', 'Tudo do Familiar', 'Planejador de viagens completo']
  },
  {
    id: 'FROTA',
    nome: 'Frota',
    preco: 'R$ 79,90/mês',
    maxVeiculos: 15,
    maxUsuarios: 15,
    beneficios: ['Até 15 veículos', 'Até 15 membros na equipe', 'Relatórios de frota', 'Suporte prioritário']
  },
  {
    id: 'FROTA_PREMIUM',
    nome: 'Frota Premium',
    preco: 'R$ 149,90/mês',
    maxVeiculos: 0, // 0 = ilimitado
    maxUsuarios: 0,
    beneficios: ['Veículos ilimitados', 'Membros ilimitados', 'Tudo do Frota', 'Atendimento dedicado']
  }
];

var Conta = {
  _precos: [],
  _precosIndisponiveis: false,

  /* =========================================================
     MEU PERFIL
     ========================================================= */
  abrirFormPerfil: function () {
    var u = usuarioAtual;
    var html =
      '<h2 class="form-titulo">Meu perfil</h2>' +
      '<div class="campo-form"><label>Nome</label>' +
        '<input type="text" id="pfNome" value="' + App.esc(u.nome || '') + '" maxlength="80">' +
      '</div>' +
      '<div class="campo-form"><label>E-mail</label>' +
        '<input type="email" id="pfEmail" value="' + App.esc(u.email || '') + '">' +
        '<small style="display:block;margin-top:6px;color:var(--txt2);font-size:12px">' +
          'Se você mudar o e-mail, enviaremos um link de confirmação para o endereço novo.' +
        '</small>' +
      '</div>' +
      '<div class="campo-form"><label>Telefone (com DDD)</label>' +
        '<input type="tel" id="pfTelefone" value="' + App.esc(u.telefone || '') + '">' +
      '</div>' +
      '<div class="form-acoes">' +
        '<button class="btn-cancelar-form" onclick="App.irPara(\'configuracoes\')">Cancelar</button>' +
        '<button class="btn-salvar-form" id="btnSalvarPerfil" onclick="Conta.salvarPerfil()">Salvar alterações</button>' +
      '</div>';
    document.getElementById('formPerfilContainer').innerHTML = html;
  },

  salvarPerfil: function () {
    var nome = document.getElementById('pfNome').value.trim();
    var email = document.getElementById('pfEmail').value.trim().toLowerCase();
    var telefone = document.getElementById('pfTelefone').value.trim();

    if (!nome) { App.toast('Informe o nome', 'erro'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { App.toast('E-mail inválido', 'erro'); return; }

    var btn = document.getElementById('btnSalvarPerfil');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    var emailMudou = email !== String(usuarioAtual.email || '').toLowerCase();

    var atualizarTabela = sb.from('usuarios').update({
      nome: nome, telefone: telefone
    }).eq('id', usuarioAtual.id);

    var atualizarAuthEmail = emailMudou
      ? sb.auth.updateUser({ email: email })
      : Promise.resolve({ error: null });

    Promise.all([atualizarTabela, atualizarAuthEmail]).then(function (r) {
      btn.disabled = false;
      btn.textContent = 'Salvar alterações';
      if (r[0].error) { App.toast('Erro: ' + r[0].error.message, 'erro'); return; }
      if (r[1] && r[1].error) {
        App.toast('Perfil salvo, mas houve erro ao atualizar o e-mail: ' + r[1].error.message, 'erro');
        return;
      }
      usuarioAtual.nome = nome;
      usuarioAtual.telefone = telefone;
      if (emailMudou) {
        App.toast('Perfil salvo! Confirme o novo e-mail através do link enviado.', 'ok');
      } else {
        App.toast('Perfil atualizado!', 'ok');
      }
      App.irPara('configuracoes');
    });
  },

  /* =========================================================
     MEU PLANO
     ========================================================= */
abrirDetalhePlano: function () {
  var el = document.getElementById(
    'detalhePlanoContainer'
  );

  if (!el) return;

  el.innerHTML =
    '<div class="vazio-veiculo">' +
      '<span class="ms">hourglass_top</span>' +
      '<p>Carregando...</p>' +
    '</div>';

  Promise.all([
    sb.from('solicitacoes_plano')
      .select('*')
      .eq('organizacaoId', orgAtual.id)
      .eq('status', 'PENDENTE')
      .order('criadoEm', { ascending: false })
      .limit(1),

    sb.from('planos_precos').select('*')
  ]).then(function (resultados) {
    var rSolicitacao = resultados[0];
    var rPrecos = resultados[1];

    var solicitacaoPendente = null;

    if (rSolicitacao.error) {
      console.error(
        'CarWay conta - solicitação:',
        rSolicitacao.error
      );
    } else {
      solicitacaoPendente =
        (rSolicitacao.data &&
          rSolicitacao.data[0]) || null;
    }

    if (rPrecos.error) {
      console.warn(
        'CarWay conta - planos_precos indisponível:',
        rPrecos.error
      );

      Conta._precos = [];
      Conta._precosIndisponiveis = true;
    } else {
      Conta._precos = rPrecos.data || [];
      Conta._precosIndisponiveis = false;
    }

    Conta._renderPlano(solicitacaoPendente);
  }).catch(function (e) {
    console.error(
      'CarWay conta - erro ao abrir plano:',
      e
    );

    Conta._precos = [];
    Conta._precosIndisponiveis = true;

    Conta._renderPlano(null);
  });
},
_precoPorId: function (planoId) {
  for (var i = 0; i < Conta._precos.length; i++) {
    if (Conta._precos[i].id === planoId) {
      return Conta._precos[i];
    }
  }

  return null;
},

_textoPrecoMensal: function (plano) {
  var registro = Conta._precoPorId(plano.id);

  if (registro) {
    var mensal = Number(registro.precoMensal) || 0;

    if (mensal <= 0) return 'Grátis';

    return App.moeda(mensal) + '/mês';
  }

  return plano.preco;
},

_textoPrecoAnual: function (plano) {
  var registro = Conta._precoPorId(plano.id);

  if (!registro) return '';

  if (
    registro.precoAnual === null ||
    registro.precoAnual === undefined
  ) {
    return '';
  }

  var anual = Number(registro.precoAnual);

  if (!anual || anual <= 0) return '';

  return App.moeda(anual) + '/ano';
},
   
 _renderPlano: function (solicitacaoPendente) {
  var el = document.getElementById(
    'detalhePlanoContainer'
  );

  if (!el) return;

  var atual = PLANOS_INFO.filter(function (p) {
    return p.id === orgAtual.tipoPlano;
  })[0] || PLANOS_INFO[0];

  var emCortesia = orgAtual.cortesia === true;

  var avisoPendente = solicitacaoPendente
    ? '<div style="background:rgba(245,158,11,.1);' +
      'border:1px solid rgba(245,158,11,.35);' +
      'border-radius:12px;padding:12px 14px;' +
      'margin-bottom:16px;font-size:13px;color:#fcd34d">' +

      '<b><span class="ms" ' +
      'style="vertical-align:middle;font-size:16px">' +
      'schedule</span> Solicitação em análise</b><br>' +

      'Você pediu mudança para <b>' +
      App.esc(
        App.nomePlano(
          solicitacaoPendente.planoSolicitado
        )
      ) +
      '</b>. Aguarde a aprovação.' +
      '</div>'
    : '';

  var avisoCortesia = emCortesia
    ? '<div style="background:rgba(167,139,250,.12);' +
      'border:1px solid rgba(167,139,250,.4);' +
      'border-radius:12px;padding:12px 14px;' +
      'margin-bottom:16px;font-size:13px;color:#ddd6fe">' +

      '<b><span class="ms" ' +
      'style="vertical-align:middle;font-size:16px">' +
      'redeem</span> Cortesia ativa</b><br>' +

      'Sua organização está isenta de cobrança neste plano.' +
      '</div>'
    : '';

  var avisoPrecos = Conta._precosIndisponiveis
    ? '<div style="background:rgba(148,163,184,.12);' +
      'border:1px solid rgba(148,163,184,.3);' +
      'border-radius:12px;padding:10px 12px;' +
      'margin-bottom:16px;font-size:12px;color:var(--txt2)">' +

      'Valores de referência. A tabela oficial de preços ' +
      'ainda não está disponível.' +
      '</div>'
    : '';

  var precoMensal = emCortesia
    ? 'Cortesia'
    : Conta._textoPrecoMensal(atual);

  var precoAnual = emCortesia
    ? ''
    : Conta._textoPrecoAnual(atual);

  var cardAtual =
    '<div style="border:1px solid var(--azul,#3b82f6);' +
    'background:rgba(59,130,246,.08);border-radius:14px;' +
    'padding:16px;margin-bottom:20px">' +

      '<small style="color:var(--azul2,#60a5fa);' +
      'font-weight:700;text-transform:uppercase;' +
      'font-size:11px">Plano atual</small>' +

      '<div style="display:flex;' +
      'justify-content:space-between;' +
      'align-items:baseline;margin-top:6px;gap:10px">' +

        '<b style="font-size:19px">' +
        App.esc(atual.nome) +
        '</b>' +

        '<div style="text-align:right">' +
          '<b style="color:' +
          (emCortesia
            ? '#ddd6fe'
            : 'var(--azul2,#60a5fa)') +
          '">' +
          App.esc(precoMensal) +
          '</b>' +

          (precoAnual
            ? '<small style="display:block;' +
              'color:var(--txt2);font-size:11.5px">ou ' +
              App.esc(precoAnual) +
              '</small>'
            : '') +
        '</div>' +
      '</div>' +

      '<ul style="margin:10px 0 0;padding-left:18px;' +
      'font-size:13px;color:var(--txt2);line-height:1.8">' +
        atual.beneficios.map(function (b) {
          return '<li>' + App.esc(b) + '</li>';
        }).join('') +
      '</ul>' +
    '</div>';

  var outros = PLANOS_INFO.filter(function (p) {
    return p.id !== atual.id;
  });

  var listaOutros =
    '<h3 style="font-size:14px;color:var(--txt2);' +
    'margin:0 0 12px">Outros planos disponíveis</h3>' +

    '<div style="display:flex;flex-direction:column;gap:10px">' +

    outros.map(function (p) {
      var desabilitado = !!solicitacaoPendente;

      var mensal = Conta._textoPrecoMensal(p);
      var anual = Conta._textoPrecoAnual(p);

      return '<div style="border:1px solid ' +
        'var(--linha,#26365c);border-radius:12px;' +
        'padding:14px">' +

        '<div style="display:flex;' +
        'justify-content:space-between;' +
        'align-items:baseline;gap:10px">' +

          '<b>' + App.esc(p.nome) + '</b>' +

          '<div style="text-align:right">' +
            '<b style="color:var(--txt2)">' +
            App.esc(mensal) +
            '</b>' +

            (anual
              ? '<small style="display:block;' +
                'color:var(--txt2);font-size:11px">ou ' +
                App.esc(anual) +
                '</small>'
              : '') +
          '</div>' +
        '</div>' +

        '<ul style="margin:8px 0 10px;padding-left:18px;' +
        'font-size:12.5px;color:var(--txt2);line-height:1.7">' +
          p.beneficios.map(function (b) {
            return '<li>' + App.esc(b) + '</li>';
          }).join('') +
        '</ul>' +

        '<button' +
        (desabilitado
          ? ' disabled style="opacity:.5;' +
            'cursor:not-allowed"'
          : '') +

        ' onclick="Conta.solicitarMudanca(\'' +
        p.id +
        '\')" ' +

        'style="width:100%;' +
        'background:var(--bg2,#111c33);' +
        'border:1px solid var(--linha,#26365c);' +
        'color:var(--txt,#e8eefc);border-radius:9px;' +
        'padding:10px;font-size:13px;font-weight:600;' +
        'cursor:pointer;font-family:inherit">' +

          'Solicitar mudança para ' +
          App.esc(p.nome) +

        '</button>' +
      '</div>';
    }).join('') +

    '</div>';

  el.innerHTML =
    avisoPendente +
    avisoCortesia +
    avisoPrecos +
    cardAtual +
    listaOutros;
},

  solicitarMudanca: function (planoId) {
    var destino = PLANOS_INFO.filter(function (p) { return p.id === planoId; })[0];
    if (!destino) return;

    App.confirmar({
      titulo: 'Solicitar mudança de plano',
      mensagem: 'Sua solicitação para o plano <b>' + App.esc(destino.nome) + '</b> será enviada para análise. ' +
        'O plano só muda depois da aprovação.',
      textoBotao: 'Enviar solicitação',
      tipo: 'aviso',
      icone: 'workspace_premium',
      aoConfirmar: function () {
        var reg = {
          id: 'SOL_' + App.uid(),
          organizacaoId: orgAtual.id,
          usuarioId: usuarioAtual.id,
          planoAtual: orgAtual.tipoPlano,
          planoSolicitado: planoId,
          status: 'PENDENTE'
        };
        sb.from('solicitacoes_plano').insert(reg).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Solicitação enviada!', 'ok');
          Conta.abrirDetalhePlano();
        });
      }
    });
  }
};
