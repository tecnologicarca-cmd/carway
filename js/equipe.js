/* APP_VERSION: v1.1-whatsapp */
/* CARWAY - EQUIPE (membros da organizacao + convites por WhatsApp) */

var PERFIS_EQUIPE = [
  { id: 'ADMIN', nome: 'Administrador', desc: 'Gerencia veículos, lançamentos e membros' },
  { id: 'MEMBRO', nome: 'Membro', desc: 'Cadastra e lança seus próprios itens' }
];

var APARENCIA_PERFIL = {
  OWNER: { ico: 'workspace_premium', cor: '#a78bfa', label: 'Dono' },
  ADMIN_MASTER: { ico: 'shield', cor: '#3b82f6', label: 'Admin master' },
  ADMIN: { ico: 'admin_panel_settings', cor: '#3b82f6', label: 'Administrador' },
  MEMBRO: { ico: 'person', cor: '#22c55e', label: 'Membro' }
};

var Equipe = {
  membros: [],
  convites: [],
  meuPerfil: '',

  carregarLista: function () {
    var el = document.getElementById('listaEquipe');
    if (!el) return;
    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';
    Equipe.meuPerfil = (orgAtual && orgAtual._meuPerfil) || 'MEMBRO';

    Promise.all([
      sb.from('membros_organizacao').select('id, usuarioId, perfil, status').eq('organizacaoId', orgAtual.id).eq('status', 'ATIVO'),
      sb.from('convites').select('*').eq('organizacaoId', orgAtual.id).eq('status', 'PENDENTE').order('criadoEm', { ascending: false })
    ]).then(function (r) {
      if (r[0].error) {
        el.innerHTML = '<div class="vazio-veiculo"><p>Erro ao carregar membros.</p></div>';
        console.error('CarWay equipe:', r[0].error);
        return;
      }
      if (r[1].error) console.error('CarWay convites:', r[1].error);

      var membrosRaw = r[0].data || [];
      Equipe.convites = r[1].data || [];
      var idsUsuarios = membrosRaw.map(function (m) { return m.usuarioId; }).filter(Boolean);

      if (!idsUsuarios.length) {
        Equipe.membros = [];
        Equipe.renderPagina();
        return;
      }

      sb.from('usuarios').select('id, nome').in('id', idsUsuarios).then(function (ru) {
        var usuariosById = {};
        (ru.data || []).forEach(function (u) { usuariosById[u.id] = u; });
        Equipe.membros = membrosRaw.map(function (m) {
          var u = usuariosById[m.usuarioId] || { nome: 'Usuário' };
          return Object.assign({}, m, { nome: u.nome });
        });
        Equipe.renderPagina();
      });
    });
  },

  souAdmin: function () {
    return ['OWNER', 'ADMIN_MASTER', 'ADMIN'].indexOf(Equipe.meuPerfil) > -1;
  },

  normalizarWhatsApp: function (telefone) {
    var numero = String(telefone || '').replace(/\D/g, '');
    if (!numero) return '';
    if (numero.indexOf('00') === 0) numero = numero.substring(2);
    if (numero.length === 10 || numero.length === 11) numero = '55' + numero;
    return numero;
  },

  whatsappValido: function (telefone) {
    var numero = Equipe.normalizarWhatsApp(telefone);
    return /^55\d{10,11}$/.test(numero);
  },

  formatarTelefone: function (telefone) {
    var numero = Equipe.normalizarWhatsApp(telefone);
    if (!numero) return '';
    if (numero.indexOf('55') === 0) numero = numero.substring(2);
    if (numero.length === 11) return '(' + numero.substring(0, 2) + ') ' + numero.substring(2, 7) + '-' + numero.substring(7);
    if (numero.length === 10) return '(' + numero.substring(0, 2) + ') ' + numero.substring(2, 6) + '-' + numero.substring(6);
    return telefone;
  },

  mensagemConvite: function (c) {
    var link = window.location.origin + window.location.pathname;
    var nome = (c.nome || '').trim();
    var saudacao = nome ? 'Olá, ' + nome + '!' : 'Olá!';
    return saudacao + '\n\n' +
      'Você foi convidado para participar da organização "' + ((orgAtual && orgAtual.nome) || 'CarWay') + '" no CarWay.\n\n' +
      'Acesse:\n' + link + '\n\n' +
      'Crie sua conta usando exatamente este e-mail:\n' + c.email + '\n\n' +
      'Após o cadastro, seu acesso será vinculado automaticamente à organização.\n\n' +
      'Equipe CarWay';
  },

  abrirWhatsApp: function (c) {
    if (!c) return;
    var numero = Equipe.normalizarWhatsApp(c.telefone);
    if (!Equipe.whatsappValido(numero)) {
      App.toast('O convite não possui um WhatsApp válido com DDD', 'erro');
      return;
    }
    var url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(Equipe.mensagemConvite(c));
    var janela = window.open(url, '_blank', 'noopener,noreferrer');
    if (!janela) window.location.href = url;
  },

  renderPagina: function () {
    var el = document.getElementById('listaEquipe');
    if (!el) return;
    var admin = Equipe.souAdmin();
    var html = '';
    if (admin) {
      html += '<div class="acoes-topo"><button class="btn-novo" onclick="App.irParaFormConvite()"><span class="ms">person_add</span> Convidar membro</button></div>';
    }
    html += '<div class="config-secao">Membros (' + Equipe.membros.length + ')</div>';
    html += Equipe.membros.map(function (m) { return Equipe.cardMembro(m, admin); }).join('');
    if (Equipe.convites.length) {
      html += '<div class="config-secao" style="margin-top:18px">Convites pendentes (' + Equipe.convites.length + ')</div>';
      html += Equipe.convites.map(function (c) { return Equipe.cardConvite(c, admin); }).join('');
    }
    el.innerHTML = html;
  },

  cardMembro: function (m, admin) {
    var ap = APARENCIA_PERFIL[m.perfil] || APARENCIA_PERFIL.MEMBRO;
    var souEu = usuarioAtual && m.usuarioId === usuarioAtual.id;
    var podeGerenciar = admin && !souEu && m.perfil !== 'OWNER';
    return '<div class="card-historico"><div class="ch-topo">' +
      '<div class="ch-icone"><span class="ms" style="color:' + ap.cor + '">' + ap.ico + '</span></div>' +
      '<div class="ch-txt"><b>' + App.esc(m.nome) + (souEu ? ' <small style="color:var(--txt2)">(você)</small>' : '') + '</b>' +
      '<small style="color:' + ap.cor + ';font-weight:600">' + ap.label + '</small></div></div>' +
      (podeGerenciar ? '<div class="acoes-abast">' +
        '<button onclick="Equipe.abrirTrocaPerfil(\'' + m.id + '\')"><span class="ms" style="color:#3b82f6">swap_horiz</span> Mudar papel</button>' +
        '<button class="excluir" onclick="Equipe.removerMembro(\'' + m.id + '\')"><span class="ms">person_remove</span> Remover</button></div>' : '') +
      '</div>';
  },

  cardConvite: function (c, admin) {
    var ap = APARENCIA_PERFIL[c.perfil] || APARENCIA_PERFIL.MEMBRO;
    var telefone = c.telefone ? Equipe.formatarTelefone(c.telefone) : 'WhatsApp não informado';
    return '<div class="card-historico"><div class="ch-topo">' +
      '<div class="ch-icone"><span class="ms" style="color:#f59e0b">schedule</span></div>' +
      '<div class="ch-txt"><b>' + App.esc(c.nome || c.email) + '</b><small>' + App.esc(c.email) + '</small>' +
      '<small>' + App.esc(telefone) + '</small><small style="color:' + ap.cor + ';font-weight:600">Convidado como ' + ap.label + '</small></div></div>' +
      (admin ? '<div class="acoes-abast">' +
        '<button onclick="Equipe.enviarConviteWhatsApp(\'' + c.id + '\')"><span class="ms" style="color:#22c55e">chat</span> WhatsApp</button>' +
        '<button onclick="Equipe.compartilharConvite(\'' + c.id + '\')"><span class="ms" style="color:#3b82f6">content_copy</span> Copiar</button>' +
        '<button class="excluir" onclick="Equipe.cancelarConvite(\'' + c.id + '\')"><span class="ms">cancel</span> Cancelar</button></div>' : '') +
      '</div>';
  },

  enviarConviteWhatsApp: function (conviteId) {
    var c = Equipe.convites.filter(function (x) { return x.id === conviteId; })[0];
    if (!c) { App.toast('Convite não encontrado', 'erro'); return; }
    Equipe.abrirWhatsApp(c);
  },

  compartilharConvite: function (conviteId) {
    var c = Equipe.convites.filter(function (x) { return x.id === conviteId; })[0];
    if (!c) return;
    var msg = Equipe.mensagemConvite(c);
    var html = '<div class="campo-form"><label>Mensagem para compartilhar</label>' +
      '<textarea id="msgConviteTxt" rows="9" style="width:100%;background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;color:var(--txt);font-family:inherit;font-size:13.5px;resize:vertical">' + App.esc(msg) + '</textarea></div>' +
      '<p style="font-size:12px;color:var(--txt2);line-height:1.5"><span class="ms" style="font-size:14px;vertical-align:middle;color:#3b82f6">info</span> Copie e envie como preferir.</p>';
    App.abrirModal('Copiar convite', html, function () {
      var txt = document.getElementById('msgConviteTxt').value;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(function () { App.toast('Mensagem copiada!', 'ok'); })
          .catch(function () { App.toast('Não foi possível copiar automaticamente', 'erro'); });
      }
      App.fecharModal();
    }, 'Copiar mensagem');
  },

  abrirTrocaPerfil: function (membroId) {
    var m = Equipe.membros.filter(function (x) { return x.id === membroId; })[0];
    if (!m) return;
    var opts = PERFIS_EQUIPE.map(function (p) { return '<option value="' + p.id + '"' + (p.id === m.perfil ? ' selected' : '') + '>' + p.nome + '</option>'; }).join('');
    var html = '<div class="campo-form"><label>Papel de ' + App.esc(m.nome) + '</label><select id="novoPerfilMembro">' + opts + '</select><small style="display:block;margin-top:8px;color:var(--txt2);font-size:12px" id="descPerfilMembro"></small></div>';
    App.abrirModal('Mudar papel', html, function () {
      var novoPerfil = document.getElementById('novoPerfilMembro').value;
      App.fecharModal();
      sb.from('membros_organizacao').update({ perfil: novoPerfil }).eq('id', membroId).then(function (r) {
        if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
        App.toast('Papel atualizado!', 'ok'); Equipe.carregarLista();
      });
    }, 'Salvar');
  },

  removerMembro: function (membroId) {
    var m = Equipe.membros.filter(function (x) { return x.id === membroId; })[0] || {};
    App.confirmar({ titulo: 'Remover membro', mensagem: '<b>' + App.esc(m.nome || 'Este membro') + '</b> perderá o acesso à organização. Os lançamentos já feitos continuam no histórico.', textoBotao: 'Remover membro', tipo: 'perigo', icone: 'person_remove', aoConfirmar: function () {
      sb.from('membros_organizacao').update({ status: 'INATIVO' }).eq('id', membroId).then(function (r) {
        if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
        App.toast('Membro removido', 'ok'); Equipe.carregarLista();
      });
    }});
  },

  cancelarConvite: function (conviteId) {
    App.confirmar({ titulo: 'Cancelar convite', mensagem: 'Este convite será cancelado.', textoBotao: 'Cancelar convite', tipo: 'perigo', icone: 'cancel', aoConfirmar: function () {
      sb.from('convites').update({ status: 'CANCELADO' }).eq('id', conviteId).then(function (r) {
        if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
        App.toast('Convite cancelado', 'ok'); Equipe.carregarLista();
      });
    }});
  },

  abrirFormConvite: function () {
    var opts = PERFIS_EQUIPE.map(function (p) { return '<option value="' + p.id + '">' + p.nome + '</option>'; }).join('');
    var html = '<h2 class="form-titulo">Convidar membro</h2>' +
      '<div class="campo-form"><label>Nome</label><input type="text" id="cvNome" placeholder="Nome da pessoa" maxlength="80"></div>' +
      '<div class="campo-form"><label>E-mail</label><input type="email" id="cvEmail" placeholder="email@exemplo.com"><small style="display:block;margin-top:6px;color:var(--txt2);font-size:12px">A pessoa precisa se cadastrar usando este mesmo e-mail.</small></div>' +
      '<div class="campo-form"><label>WhatsApp</label><input type="tel" id="cvTelefone" placeholder="(21) 99999-9999" inputmode="tel" maxlength="20"><small style="display:block;margin-top:6px;color:var(--txt2);font-size:12px">Informe o número com DDD. O código 55 será adicionado automaticamente.</small></div>' +
      '<div class="campo-form"><label>Papel</label><select id="cvPerfil">' + opts + '</select></div>' +
      '<div class="form-acoes"><button class="btn-cancelar-form" onclick="App.irPara(\'equipe\')">Cancelar</button>' +
      '<button class="btn-salvar-form" id="btnSalvarConvite" onclick="Equipe.salvarConvite()">Criar e abrir WhatsApp</button></div>';
    document.getElementById('formConviteContainer').innerHTML = html;
  },

  salvarConvite: function () {
    var nome = document.getElementById('cvNome').value.trim();
    var email = document.getElementById('cvEmail').value.trim().toLowerCase();
    var telefoneDigitado = document.getElementById('cvTelefone').value.trim();
    var telefone = Equipe.normalizarWhatsApp(telefoneDigitado);
    var perfil = document.getElementById('cvPerfil').value;

    if (!nome) { App.toast('Informe o nome da pessoa', 'erro'); return; }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { App.toast('Informe um e-mail válido', 'erro'); return; }
    if (!Equipe.whatsappValido(telefone)) { App.toast('Informe um WhatsApp válido com DDD', 'erro'); return; }

    var reg = { id: 'CVT_' + App.uid(), organizacaoId: orgAtual.id, usuarioOrigemId: usuarioAtual.id, tipo: 'NOVO_MEMBRO', nome: nome, telefone: telefone, email: email, perfil: perfil, status: 'PENDENTE', token: App.uid() + App.uid() };
    var btn = document.getElementById('btnSalvarConvite');
    btn.disabled = true; btn.textContent = 'Criando convite...';

    sb.from('convites').insert(reg).then(function (r) {
      btn.disabled = false; btn.textContent = 'Criar e abrir WhatsApp';
      if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
      App.toast('Convite criado. Abrindo WhatsApp...', 'ok');
      Equipe.abrirWhatsApp(reg);
      App.irPara('equipe');
    });
  }
};
