/* APP_VERSION: v1.0-status-organizacao */
/* CARWAY - Complemento seguro para inativar/reativar organizacoes.
   Carregar DEPOIS de paineladmin.js. */
'use strict';

(function () {
  if (typeof PainelAdmin === 'undefined') {
    console.error('CarWay: paineladmin.js precisa ser carregado antes de paineladmin_status_org.js');
    return;
  }

  PainelAdmin._statusOrganizacaoAlterando = false;

  PainelAdmin._cardOrganizacao = function (o) {
    var cortesia = o.cortesia === true;
    var status = String(o.status || '').trim().toUpperCase();
    var statusAtivo = status === 'ATIVO';
    var ehPrincipal = o.id === 'ORG_MASTER_001';
    var corStatus = statusAtivo ? '#86efac' : '#fca5a5';
    var fundoStatus = statusAtivo ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.14)';
    var bordaCard = statusAtivo ? (cortesia ? '#a78bfa' : '#22d3ee') : '#ef4444';

    return '<div style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-left:4px solid ' +
      bordaCard + ';border-radius:14px;padding:14px;opacity:' + (statusAtivo ? '1' : '.88') + '">' +
      '<div style="display:flex;align-items:flex-start;gap:10px">' +
        '<span class="ms" style="color:' + (statusAtivo ? '#22d3ee' : '#ef4444') + ';font-size:24px">' +
          (statusAtivo ? 'apartment' : 'domain_disabled') + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<b style="display:block;font-size:15px">' + App.esc(o.nome || o.id) + '</b>' +
          '<small style="display:block;color:var(--txt2);font-size:11px;overflow-wrap:anywhere">' + App.esc(o.id) + '</small>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;padding:4px 8px;border-radius:99px;background:' + fundoStatus + ';color:' + corStatus + '">' +
          (statusAtivo ? 'ATIVA' : 'INATIVA') + '</span>' +
      '</div>' +

      (!statusAtivo
        ? '<div style="margin-top:10px;padding:9px 10px;border-radius:9px;background:rgba(239,68,68,.09);border:1px solid rgba(239,68,68,.24);color:#fecaca;font-size:11.5px;line-height:1.45">' +
            '<span class="ms" style="font-size:15px;vertical-align:middle">block</span> Acesso da organização bloqueado administrativamente.' +
          '</div>'
        : '') +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">' +
        '<div style="background:var(--bg2,#111c33);border-radius:9px;padding:9px 10px">' +
          '<small style="display:block;color:var(--txt2);font-size:10px;text-transform:uppercase">Plano</small>' +
          '<b style="font-size:12.5px;color:#a78bfa">' + App.esc(App.nomePlano(o.tipoPlano || 'FREE')) + '</b>' +
        '</div>' +
        '<div style="background:var(--bg2,#111c33);border-radius:9px;padding:9px 10px">' +
          '<small style="display:block;color:var(--txt2);font-size:10px;text-transform:uppercase">Cortesia</small>' +
          '<b style="font-size:12.5px;color:' + (cortesia ? '#86efac' : 'var(--txt2)') + '">' + (cortesia ? 'SIM' : 'NÃO') + '</b>' +
        '</div>' +
      '</div>' +

      (cortesia && o.cortesiaMotivo
        ? '<div style="margin-top:8px;font-size:11.5px;color:var(--txt2)"><span class="ms" style="font-size:15px;color:#a78bfa">redeem</span> ' + App.esc(o.cortesiaMotivo) + '</div>'
        : '') +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">' +
        '<button class="btn-admin-share" onclick="PainelAdmin.abrirAlterarPlano(\'' + App.esc(o.id) + '\')"' + (statusAtivo ? '' : ' disabled style="opacity:.55;cursor:not-allowed"') + '>' +
          '<span class="ms" style="color:#60a5fa">workspace_premium</span>Alterar plano</button>' +
        '<button class="btn-admin-share" onclick="PainelAdmin.abrirCortesia(\'' + App.esc(o.id) + '\')"' + (statusAtivo ? '' : ' disabled style="opacity:.55;cursor:not-allowed"') + '>' +
          '<span class="ms" style="color:' + (cortesia ? '#ef4444' : '#a78bfa') + '">' + (cortesia ? 'card_giftcard_off' : 'redeem') + '</span>' +
          (cortesia ? 'Remover cortesia' : 'Conceder cortesia') + '</button>' +
      '</div>' +

      (ehPrincipal
        ? '<div style="margin-top:8px;text-align:center;color:var(--txt2);font-size:11px"><span class="ms" style="font-size:14px">verified_user</span> Organização principal protegida</div>'
        : '<button class="btn-admin-share" style="width:100%;margin-top:8px;border-color:' + (statusAtivo ? 'rgba(239,68,68,.42)' : 'rgba(34,197,94,.42)') + ';color:' + (statusAtivo ? '#fca5a5' : '#86efac') + '" onclick="PainelAdmin.abrirAlterarStatusOrganizacao(\'' + App.esc(o.id) + '\')">' +
            '<span class="ms">' + (statusAtivo ? 'block' : 'settings_backup_restore') + '</span>' +
            (statusAtivo ? 'Inativar organização' : 'Reativar organização') +
          '</button>') +
    '</div>';
  };

  PainelAdmin.abrirAlterarStatusOrganizacao = function (organizacaoId) {
    if (PainelAdmin._statusOrganizacaoAlterando) return;
    var org = PainelAdmin._organizacaoPorId(organizacaoId);
    if (!org) return;

    var estaAtiva = String(org.status || '').trim().toUpperCase() === 'ATIVO';

    if (!estaAtiva) {
      App.confirmar({
        titulo: 'Reativar organização',
        mensagem: 'A organização ' + (org.nome || org.id) + ' voltará a ter acesso ao CarWay conforme o plano atual.',
        textoBotao: 'Reativar organização',
        tipo: 'ok',
        icone: 'settings_backup_restore',
        aoConfirmar: function () {
          PainelAdmin.salvarStatusOrganizacao(organizacaoId, 'ATIVO', '');
        }
      });
      return;
    }

    var html =
      '<div class="aviso erro" style="margin-bottom:14px">' +
        '<span class="ms">warning</span>' +
        '<div><b>Ação crítica</b>Os membros desta organização perderão o acesso ao CarWay até que a organização seja reativada.</div>' +
      '</div>' +
      '<div class="campo-form">' +
        '<label>Organização</label>' +
        '<input value="' + App.esc(org.nome || org.id) + '" disabled>' +
      '</div>' +
      '<div class="campo-form">' +
        '<label>Motivo da inativação</label>' +
        '<textarea id="adminInativacaoMotivo" maxlength="500" rows="4" placeholder="Ex.: inadimplência, encerramento da conta, solicitação do cliente..."></textarea>' +
        '<small>Obrigatório. Mínimo de 5 caracteres. O motivo ficará registrado na auditoria administrativa.</small>' +
      '</div>';

    App.abrirModal('Inativar organização', html, function () {
      var campo = document.getElementById('adminInativacaoMotivo');
      var motivo = campo ? campo.value.trim() : '';
      if (motivo.length < 5) {
        App.toast('Informe o motivo da inativação com pelo menos 5 caracteres', 'erro');
        if (campo) campo.focus();
        return;
      }
      PainelAdmin.salvarStatusOrganizacao(organizacaoId, 'INATIVO', motivo);
    }, 'Inativar organização');
  };

  PainelAdmin.salvarStatusOrganizacao = function (organizacaoId, novoStatus, motivo) {
    if (PainelAdmin._statusOrganizacaoAlterando) return;
    PainelAdmin._statusOrganizacaoAlterando = true;

    var botao = document.getElementById('btnModalSalvar');
    if (botao) {
      botao.disabled = true;
      botao.textContent = novoStatus === 'INATIVO' ? 'Inativando...' : 'Reativando...';
    }

    sb.rpc('alterar_status_organizacao_master', {
      p_organizacao_id: organizacaoId,
      p_novo_status: novoStatus,
      p_motivo: motivo || null
    }).then(function (r) {
      if (r.error) throw r.error;
      App.fecharModal();
      App.toast(novoStatus === 'INATIVO' ? 'Organização inativada com sucesso' : 'Organização reativada com sucesso', 'ok');
      PainelAdmin.carregarDados();
    }).catch(function (erro) {
      App.toast('Erro: ' + ((erro && erro.message) || 'não foi possível alterar o status'), 'erro');
    }).then(function () {
      PainelAdmin._statusOrganizacaoAlterando = false;
      if (botao) {
        botao.disabled = false;
        botao.textContent = novoStatus === 'INATIVO' ? 'Inativar organização' : 'Reativar organização';
      }
    });
  };

  /* Se o painel já estiver aberto, redesenha os cards com as novas ações. */
  if (document.getElementById('painelAdminContainer') && PainelAdmin.organizacoes.length) {
    PainelAdmin._render();
  }
})();
