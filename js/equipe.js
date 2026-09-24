/* APP_VERSION: v1.0 */

/* =====================================================================
   CARWAY - EQUIPE (membros da organização + convites)

   Tabelas usadas:
   - membros_organizacao: id, organizacaoId, usuarioId, perfil, status
   - usuarios: id, nome, auth_id
   - convites: id, organizacaoId, tipo, usuarioOrigemId, nome, telefone,
               email, perfil, status, token, criadoEm

   IMPORTANTE (leia antes de usar em produção):
   Este módulo CRIA o registro de convite (tabela 'convites') e permite
   ao admin copiar uma mensagem para enviar manualmente (WhatsApp/e-mail)
   à pessoa convidada. Ele NÃO envia e-mail automático — isso exigiria
   uma Edge Function própria (como as que já criamos para Places/Routes),
   que ainda não existe para este fluxo.
   Além disso, para o convidado realmente "entrar" na organização ao se
   cadastrar, a RPC 'criar_conta_completa' (chamada no cadastro, em
   app.js -> fazerCadastro) precisa checar se existe um convite PENDENTE
   com o e-mail informado e, se existir, vincular o novo usuário a essa
   organização/perfil em vez de criar uma organização nova. Não tenho
   acesso ao código dessa RPC (é uma função SQL no Supabase) — se ela
   ainda não fizer isso, o convite fica registrado mas o cadastro da
   pessoa não entra automaticamente na equipe. Me envie o SQL da RPC
   para eu confirmar/ajustar isso.
   ===================================================================== */

var PERFIS_EQUIPE = [
  { id: 'ADMIN',   nome: 'Administrador', desc: 'Gerencia veículos, lançamentos e membros' },
  { id: 'MEMBRO',  nome: 'Membro',        desc: 'Cadastra e lança seus próprios itens' }
];

/* Aparência (ícone + cor) por papel — segue a convenção do app:
   roxo = dono/master, azul = admin, verde = membro comum. */
var APARENCIA_PERFIL = {
  OWNER:        { ico: 'workspace_premium', cor: '#a78bfa', label: 'Dono' },
  ADMIN_MASTER: { ico: 'shield',            cor: '#3b82f6', label: 'Admin master' },
  ADMIN:        { ico: 'admin_panel_settings', cor: '#3b82f6', label: 'Administrador' },
  MEMBRO:       { ico: 'person',            cor: '#22c55e', label: 'Membro' }
};

var Equipe = {
  membros: [],
  convites: [],
  meuPerfil: '',

  /* =========================================================
     CARREGAR LISTA
     ========================================================= */
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

  /** Só OWNER/ADMIN_MASTER/ADMIN podem convidar, mudar perfil ou remover — mesma regra do RLS. */
  souAdmin: function () {
    return ['OWNER', 'ADMIN_MASTER', 'ADMIN'].indexOf(Equipe.meuPerfil) > -1;
  },

  renderPagina: function () {
    var el = document.getElementById('listaEquipe');
    var admin = Equipe.souAdmin();

    var html = '';

    if (admin) {
      html += '<div class="acoes-topo">' +
        '<button class="btn-novo" onclick="App.irParaFormConvite()">' +
          '<span class="ms">person_add</span> Convidar membro' +
        '</button>' +
      '</div>';
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

    return '<div class="card-historico">' +
      '<div class="ch-topo">' +
        '<div class="ch-icone"><span class="ms" style="color:' + ap.cor + '">' + ap.ico + '</span></div>' +
        '<div class="ch-txt">' +
          '<b>' + App.esc(m.nome) + (souEu ? ' <small style="color:var(--txt2)">(você)</small>' : '') + '</b>' +
          '<small style="color:' + ap.cor + ';font-weight:600">' + ap.label + '</small>' +
        '</div>' +
      '</div>' +
      (podeGerenciar
        ? '<div class="acoes-abast">' +
            '<button onclick="Equipe.abrirTrocaPerfil(\'' + m.id + '\')"><span class="ms" style="color:#3b82f6">swap_horiz</span> Mudar papel</button>' +
            '<button class="excluir" onclick="Equipe.removerMembro(\'' + m.id + '\')"><span class="ms">person_remove</span> Remover</button>' +
          '</div>'
        : '') +
    '</div>';
  },

  cardConvite: function (c, admin) {
    var ap = APARENCIA_PERFIL[c.perfil] || APARENCIA_PERFIL.MEMBRO;
    return '<div class="card-historico">' +
      '<div class="ch-topo">' +
        '<div class="ch-icone"><span class="ms" style="color:#f59e0b">schedule</span></div>' +
        '<div class="ch-txt">' +
          '<b>' + App.esc(c.nome || c.email) + '</b>' +
          '<small>' + App.esc(c.email) + '</small>' +
          '<small style="color:' + ap.cor + ';font-weight:600">Convidado como ' + ap.label + '</small>' +
        '</div>' +
      '</div>' +
      (admin
        ? '<div class="acoes-abast">' +
            '<button onclick="Equipe.compartilharConvite(\'' + c.id + '\')"><span class="ms" style="color:#22c55e">share</span> Compartilhar</button>' +
            '<button class="excluir" onclick="Equipe.cancelarConvite(\'' + c.id + '\')"><span class="ms">cancel</span> Cancelar</button>' +
          '</div>'
        : '') +
    '</div>';
  },

  /* =========================================================
     TROCAR PAPEL (modal simples, mesma convenção do
     Manutencoes.criarPlanoPadrao — ação de poucos campos)
     ========================================================= */
  abrirTrocaPerfil: function (membroId) {
    var m = Equipe.membros.filter(function (x) { return x.id === membroId; })[0];
    if (!m) return;

    var opts = PERFIS_EQUIPE.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === m.perfil ? ' selected' : '') + '>' + p.nome + '</option>';
    }).join('');

    var html = '<div class="campo-form"><label>Papel de ' + App.esc(m.nome) + '</label>' +
      '<select id="novoPerfilMembro">' + opts + '</select>' +
      '<small style="display:block;margin-top:8px;color:var(--txt2);font-size:12px" id="descPerfilMembro"></small>' +
    '</div>';

    App.abrirModal('Mudar papel', html, function () {
      var novoPerfil = document.getElementById('novoPerfilMembro').value;
      App.fecharModal();
      sb.from('membros_organizacao').update({ perfil: novoPerfil }).eq('id', membroId).then(function (r) {
        if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
        App.toast('Papel atualizado!', 'ok');
        Equipe.carregarLista();
      });
    }, 'Salvar');

    /* Atualiza a descrição do papel selecionado */
    setTimeout(function () {
      var sel = document.getElementById('novoPerfilMembro');
      var desc = document.getElementById('descPerfilMembro');
      function atualizar() {
        var p = PERFIS_EQUIPE.filter(function (x) { return x.id === sel.value; })[0];
        if (desc && p) desc.textContent = p.desc;
      }
      if (sel) { sel.addEventListener('change', atualizar); atualizar(); }
    }, 50);
  },

  /* =========================================================
     REMOVER MEMBRO / CANCELAR CONVITE
     (vermelho = ação negativa, seguindo a convenção do app)
     ========================================================= */
  removerMembro: function (membroId) {
    var m = Equipe.membros.filter(function (x) { return x.id === membroId; })[0] || {};
    App.confirmar({
      titulo: 'Remover membro',
      mensagem: '<b>' + App.esc(m.nome || 'Este membro') + '</b> perderá o acesso à organização. ' +
        'Os lançamentos que essa pessoa já fez continuam no histórico.',
      textoBotao: 'Remover membro',
      tipo: 'perigo',
      icone: 'person_remove',
      aoConfirmar: function () {
        sb.from('membros_organizacao').update({ status: 'INATIVO' }).eq('id', membroId).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Membro removido', 'ok');
          Equipe.carregarLista();
        });
      }
    });
  },

  cancelarConvite: function (conviteId) {
    App.confirmar({
      titulo: 'Cancelar convite',
      mensagem: 'Este convite será cancelado. A pessoa não conseguirá mais entrar usando este link.',
      textoBotao: 'Cancelar convite',
      tipo: 'perigo',
      icone: 'cancel',
      aoConfirmar: function () {
        sb.from('convites').update({ status: 'CANCELADO' }).eq('id', conviteId).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Convite cancelado', 'ok');
          Equipe.carregarLista();
        });
      }
    });
  },

  /** Mostra a mensagem pronta para o admin copiar/compartilhar manualmente. */
  compartilharConvite: function (conviteId) {
    var c = Equipe.convites.filter(function (x) { return x.id === conviteId; })[0];
    if (!c) return;
    var link = window.location.origin + window.location.pathname;
    var msg = 'Você foi convidado para fazer parte do CarWay, no grupo "' + (orgAtual.nome || 'nossa organização') + '"!\n\n' +
      'Acesse ' + link + ' e crie sua conta usando este e-mail: ' + c.email + '\n\n' +
      'Assim que você criar a conta com esse e-mail, o convite será vinculado automaticamente.';

    var html = '<div class="campo-form"><label>Mensagem para compartilhar</label>' +
      '<textarea id="msgConviteTxt" rows="6" style="width:100%;background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;color:var(--txt);font-family:inherit;font-size:13.5px;resize:vertical">' + App.esc(msg) + '</textarea>' +
    '</div>' +
    '<p style="font-size:12px;color:var(--txt2);line-height:1.5">' +
      '<span class="ms" style="font-size:14px;vertical-align:middle;color:#3b82f6">info</span> ' +
      'Copie e envie por WhatsApp, e-mail ou como preferir.' +
    '</p>';

    App.abrirModal('Compartilhar convite', html, function () {
      var txt = document.getElementById('msgConviteTxt').value;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(function () {
          App.toast('Mensagem copiada!', 'ok');
        }).catch(function () {
          App.toast('Não foi possível copiar automaticamente', 'erro');
        });
      }
      App.fecharModal();
    }, 'Copiar mensagem');
  },

  /* =========================================================
     FORMULARIO DE CONVITE (página própria)
     ========================================================= */
  abrirFormConvite: function () {
    var opts = PERFIS_EQUIPE.map(function (p) {
      return '<option value="' + p.id + '">' + p.nome + '</option>';
    }).join('');

    var html =
      '<h2 class="form-titulo">Convidar membro</h2>' +
      '<div class="campo-form"><label>Nome</label>' +
        '<input type="text" id="cvNome" placeholder="Nome da pessoa" maxlength="80">' +
      '</div>' +
      '<div class="campo-form"><label>E-mail</label>' +
        '<input type="email" id="cvEmail" placeholder="email@exemplo.com">' +
        '<small style="display:block;margin-top:6px;color:var(--txt2);font-size:12px">' +
          'A pessoa precisa se cadastrar no CarWay usando este mesmo e-mail.' +
        '</small>' +
      '</div>' +
      '<div class="campo-form"><label>Papel</label>' +
        '<select id="cvPerfil">' + opts + '</select>' +
      '</div>' +
      '<div class="form-acoes">' +
        '<button class="btn-cancelar-form" onclick="App.irPara(\'equipe\')">Cancelar</button>' +
        '<button class="btn-salvar-form" id="btnSalvarConvite" onclick="Equipe.salvarConvite()">Enviar convite</button>' +
      '</div>';

    document.getElementById('formConviteContainer').innerHTML = html;
  },

  salvarConvite: function () {
    var nome = document.getElementById('cvNome').value.trim();
    var email = document.getElementById('cvEmail').value.trim().toLowerCase();
    var perfil = document.getElementById('cvPerfil').value;

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      App.toast('Informe um e-mail válido', 'erro');
      return;
    }

    var reg = {
      id: 'CVT_' + App.uid(),
      organizacaoId: orgAtual.id,
      usuarioOrigemId: usuarioAtual.id,
      tipo: 'NOVO_MEMBRO',
      nome: nome,
      email: email,
      perfil: perfil,
      status: 'PENDENTE',
      token: App.uid() + App.uid()
    };

    var btn = document.getElementById('btnSalvarConvite');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    sb.from('convites').insert(reg).then(function (r) {
      btn.disabled = false;
      btn.textContent = 'Enviar convite';
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        return;
      }
      App.toast('Convite criado!', 'ok');
      App.irPara('equipe');
      /* Já abre a mensagem pronta pra compartilhar, poupando um clique */
      setTimeout(function () { Equipe.compartilharConvite(reg.id); }, 300);
    });
  }
};
