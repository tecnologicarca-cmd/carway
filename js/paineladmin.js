/* APP_VERSION: v3.0 */
/* =====================================================================
   CARWAY - PAINEL ADMINISTRATIVO V3 (somente master)
   Novidades desta versao:
   - Precos dos planos editaveis pelo master
   - Solicitacao de plano FREE e aprovada automaticamente (ver tambem o
     trigger auto_aprovar_solicitacao_free no banco; aqui existe uma
     rotina de reforco para resolver pendencias antigas)
   - Cards da Visao geral clicaveis (filtram/abrem as secoes abaixo)
   - "Organizacoes por plano" clicavel: filtra a Gestao de organizacoes
   - Gestao de organizacoes e Usuarios ficam recolhidos por padrao,
     com busca por nome/e-mail para telas com muitos registros
   ===================================================================== */

var PainelAdmin = {
  organizacoes: [],
  usuarios: [],
  solicitacoes: [],
  convitesPendentes: 0,
  precos: [],
  precosIndisponiveis: false,

  /* ---- estado da tela (filtros e secoes recolhidas) ---- */
  _abertoOrganizacoes: false,
  _abertoUsuarios: false,
  _abertoPlanos: false,
  _abertoPrecos: false,
  _filtroPlano: null,          // null = todos | 'FREE' | 'FAMILIAR' | ...
  _filtroCortesia: null,       // null = todos | true = somente cortesia
  _filtroStatusUsuario: null,  // null = todos | 'ATIVO' | 'INATIVO'
  _buscaOrg: '',
  _buscaUsuario: '',

  /* ============ CARREGAMENTO ============ */

  carregarDados: function () {
    var el = document.getElementById('painelAdminContainer');
    if (!el) return;

    if (!App.souMaster()) {
      el.innerHTML = '<div class="vazio-veiculo"><span class="ms">lock</span><b>Acesso restrito</b><p>Esta área é exclusiva do administrador do CarWay.</p></div>';
      return;
    }

    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando painel administrativo...</p></div>';

    Promise.all([
      sb.from('organizacoes')
        .select('id,nome,tipoPlano,status,cortesia,cortesiaMotivo,cortesiaConcedidaEm,cortesiaConcedidaPor,criadoEm')
        .order('criadoEm', { ascending: false }),

      sb.from('usuarios')
        .select('id,nome,email,status,isMaster,criadoEm')
        .order('criadoEm', { ascending: false }),

      sb.from('solicitacoes_plano')
        .select('*')
        .eq('status', 'PENDENTE')
        .order('criadoEm', { ascending: false }),

      sb.from('convites')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDENTE'),

      sb.from('planos_precos').select('*')
    ]).then(function (r) {
      var erro = r[0].error || r[1].error || r[2].error || r[3].error;
      if (erro) {
        console.error('CarWay painel admin:', erro);
        el.innerHTML = '<div class="vazio-veiculo"><span class="ms">error</span><b>Erro ao carregar</b><p>' + App.esc(erro.message || 'Erro administrativo') + '</p></div>';
        return;
      }

      PainelAdmin.organizacoes = r[0].data || [];
      PainelAdmin.usuarios = r[1].data || [];
      PainelAdmin.solicitacoes = r[2].data || [];
      PainelAdmin.convitesPendentes = r[3].count || 0;

      if (r[4].error) {
        /* Tabela de precos ainda nao criada: nao quebra o resto do painel */
        PainelAdmin.precos = [];
        PainelAdmin.precosIndisponiveis = true;
      } else {
        PainelAdmin.precos = r[4].data || [];
        PainelAdmin.precosIndisponiveis = false;
      }

      /* Reforco: aprova sozinho qualquer solicitacao de FREE que ainda
         esteja pendente (cobre registros criados antes do trigger). */
      PainelAdmin._autoAprovarFreePendentes().then(function (resolveuAlgo) {
        if (resolveuAlgo) {
          PainelAdmin.carregarDados();
        } else {
          PainelAdmin._render();
        }
      });
    }).catch(function (e) {
      console.error('CarWay painel admin:', e);
      el.innerHTML = '<div class="vazio-veiculo"><span class="ms">error</span><b>Erro ao carregar</b><p>' + App.esc(e.message || 'Erro desconhecido') + '</p></div>';
    });
  },

  _autoAprovarFreePendentes: function () {
    var pendentesFree = PainelAdmin.solicitacoes.filter(function (s) {
      return String(s.status).toUpperCase() === 'PENDENTE' && s.planoSolicitado === 'FREE';
    });
    if (!pendentesFree.length) return Promise.resolve(false);

    var tarefas = pendentesFree.map(function (s) {
      return sb.from('solicitacoes_plano').update({
        status: 'APROVADA',
        resolvidoEm: new Date().toISOString()
      }).eq('id', s.id).then(function () {
        return sb.from('organizacoes').update({
          tipoPlano: 'FREE',
          atualizadoEm: new Date().toISOString()
        }).eq('id', s.organizacaoId);
      });
    });

    return Promise.all(tarefas).then(function () { return true; }).catch(function (e) {
      console.error('CarWay auto-aprovacao FREE:', e);
      return false;
    });
  },

  _planos: function () {
    if (typeof PLANOS_INFO !== 'undefined' && Array.isArray(PLANOS_INFO) && PLANOS_INFO.length) {
      return PLANOS_INFO;
    }
    return [
      { id: 'FREE', nome: 'Free' },
      { id: 'FAMILIAR', nome: 'Familiar' },
      { id: 'FAMILIAR_PREMIUM', nome: 'Familiar Premium' },
      { id: 'FROTA', nome: 'Frota' },
      { id: 'FROTA_PREMIUM', nome: 'Frota Premium' }
    ];
  },

  _precoPorId: function (id) {
    return PainelAdmin.precos.filter(function (p) { return p.id === id; })[0] || null;
  },

  /* ============ RENDER PRINCIPAL ============ */

  _render: function () {
    var el = document.getElementById('painelAdminContainer');
    if (!el) return;

    el.innerHTML =
      PainelAdmin._htmlKpis() +
      PainelAdmin._htmlPlanos() +
      PainelAdmin._htmlPrecos() +
      PainelAdmin._htmlConvite() +
      PainelAdmin._htmlSolicitacoes() +
      PainelAdmin._htmlOrganizacoesSecao() +
      PainelAdmin._htmlUsuariosSecao();

    /* preenche as listas internas (organizacoes/usuarios) depois que os
       containers ja existem no DOM */
    PainelAdmin._renderOrganizacoesLista();
    PainelAdmin._renderUsuariosLista();
  },

  /* ============ KPIs (clicaveis) ============ */

  _htmlKpis: function () {
    var ativos = PainelAdmin.usuarios.filter(function (u) {
      return String(u.status || '').toUpperCase() === 'ATIVO';
    }).length;
    var inativos = PainelAdmin.usuarios.length - ativos;
    var cortesias = PainelAdmin.organizacoes.filter(function (o) { return o.cortesia === true; }).length;

    var itens = [
      { icone: 'group', cor: '#3b82f6', fundo: 'rgba(59,130,246,.15)', valor: PainelAdmin.usuarios.length, titulo: 'Usuários', fn: "PainelAdmin.abrirSecaoUsuarios(null)" },
      { icone: 'check_circle', cor: '#22c55e', fundo: 'rgba(34,197,94,.15)', valor: ativos, titulo: 'Ativos', fn: "PainelAdmin.abrirSecaoUsuarios('ATIVO')" },
      { icone: 'person_off', cor: '#94a3b8', fundo: 'rgba(148,163,184,.15)', valor: inativos, titulo: 'Inativos', fn: "PainelAdmin.abrirSecaoUsuarios('INATIVO')" },
      { icone: 'apartment', cor: '#22d3ee', fundo: 'rgba(34,211,238,.15)', valor: PainelAdmin.organizacoes.length, titulo: 'Organizações', fn: "PainelAdmin.abrirSecaoOrganizacoes(null,null)" },
      { icone: 'redeem', cor: '#a78bfa', fundo: 'rgba(167,139,250,.15)', valor: cortesias, titulo: 'Cortesias', fn: "PainelAdmin.abrirSecaoOrganizacoes(null,true)" },
      { icone: 'upgrade', cor: '#f59e0b', fundo: 'rgba(245,158,11,.15)', valor: PainelAdmin.solicitacoes.length, titulo: 'Solicitações', fn: "PainelAdmin.rolarPara('painelSecaoSolicitacoes')" },
      { icone: 'mail', cor: '#60a5fa', fundo: 'rgba(96,165,250,.15)', valor: PainelAdmin.convitesPendentes, titulo: 'Convites', fn: "PainelAdmin.abrirConvitesPendentes()" }
    ];

    return '<div class="secao-titulo"><span class="ms">dashboard</span>Visão geral</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:22px">' +
      itens.map(function (item) {
        return '<button onclick="' + item.fn + '" class="kpi-abast" ' +
          'style="margin:0;border:1px solid var(--linha,#26365c);cursor:pointer;text-align:left;font-family:inherit;color:inherit;width:100%">' +
          '<span class="ms" style="background:' + item.fundo + ';color:' + item.cor + '">' + item.icone + '</span>' +
          '<b>' + item.valor + '</b>' +
          '<span class="lbl">' + item.titulo + '</span>' +
        '</button>';
      }).join('') +
      '</div>';
  },

  rolarPara: function (id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /* ============ ORGANIZACOES POR PLANO (clicavel = filtro) ============ */

  _htmlPlanos: function () {
    var porPlano = {};
    PainelAdmin.organizacoes.forEach(function (o) {
      var plano = o.tipoPlano || 'FREE';
      porPlano[plano] = (porPlano[plano] || 0) + 1;
    });
    var aberto = PainelAdmin._abertoPlanos;

    return '<div class="secao-titulo" style="cursor:pointer;justify-content:space-between" onclick="PainelAdmin.toggleSecao(\'planos\')">' +
        '<span style="display:flex;align-items:center;gap:8px"><span class="ms" style="color:#a78bfa">workspace_premium</span>Organizações por plano</span>' +
        '<span class="ms">' + (aberto ? 'expand_less' : 'expand_more') + '</span>' +
      '</div>' +
      '<div style="' + (aberto ? '' : 'display:none') + ';flex-direction:column;gap:8px;margin-bottom:22px">' +
      PainelAdmin._planos().map(function (p) {
        var qtd = porPlano[p.id] || 0;
        var selecionado = PainelAdmin._filtroPlano === p.id;
        return '<button onclick="PainelAdmin.filtrarPorPlano(\'' + p.id + '\')" ' +
          'style="display:flex;width:100%;box-sizing:border-box;justify-content:space-between;align-items:center;padding:11px 14px;cursor:pointer;font-family:inherit;font-size:14px;text-align:left;' +
          'background:' + (selecionado ? 'rgba(167,139,250,.15)' : 'var(--bg2,#111c33)') + ';' +
          'border:1px solid ' + (selecionado ? '#a78bfa' : 'var(--linha,#26365c)') + ';border-radius:10px;color:var(--txt,#e8eefc)">' +
          '<span>' + App.esc(p.nome) + (selecionado ? ' <span class="ms" style="font-size:14px;vertical-align:middle;color:#a78bfa">filter_alt</span>' : '') + '</span>' +
          '<b style="color:#a78bfa">' + qtd + '</b>' +
        '</button>';
      }).join('') +
      '</div>';
  },

  filtrarPorPlano: function (planoId) {
    PainelAdmin._filtroPlano = (PainelAdmin._filtroPlano === planoId) ? null : planoId;
    PainelAdmin._abertoOrganizacoes = true;
    PainelAdmin._render();
    PainelAdmin.rolarPara('painelSecaoOrganizacoes');
  },

  /* ============ PRECOS DOS PLANOS (editavel, recolhido por padrao) ============ */

  _htmlPrecos: function () {
    var aberto = PainelAdmin._abertoPrecos;
    var titulo = '<div class="secao-titulo" style="cursor:pointer;justify-content:space-between" onclick="PainelAdmin.toggleSecao(\'precos\')">' +
        '<span style="display:flex;align-items:center;gap:8px"><span class="ms" style="color:#22c55e">payments</span>Preços dos planos</span>' +
        '<span class="ms">' + (aberto ? 'expand_less' : 'expand_more') + '</span>' +
      '</div>';

    if (!aberto) {
      return titulo;
    }

    if (PainelAdmin.precosIndisponiveis) {
      return titulo + '<div class="aviso-plano" style="margin-bottom:22px">' +
        '<b>Tabela de preços não encontrada</b>' +
        'Execute o script SQL "planos_precos" no Supabase para habilitar a edição de preços diretamente por aqui.' +
      '</div>';
    }

    return titulo + '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:22px">' +
      PainelAdmin._planos().map(function (p) {
        var preco = PainelAdmin._precoPorId(p.id);
        var mensal = preco ? Number(preco.precoMensal) || 0 : 0;
        var anual = preco && preco.precoAnual !== null && preco.precoAnual !== undefined ? Number(preco.precoAnual) : null;
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 14px;' +
          'background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);border-radius:10px">' +
          '<div style="min-width:0">' +
            '<b style="display:block;font-size:13px">' + App.esc(p.nome) + '</b>' +
            '<small style="display:block;color:var(--txt2);font-size:11.5px">' +
              App.moeda(mensal) + '/mês' + (anual ? ' · ' + App.moeda(anual) + '/ano' : '') +
            '</small>' +
          '</div>' +
          '<button class="btn-admin-share" style="flex:none;padding:8px 12px" onclick="PainelAdmin.abrirEditarPreco(\'' + p.id + '\')">' +
            '<span class="ms" style="color:#60a5fa;font-size:16px">edit</span> Editar' +
          '</button>' +
        '</div>';
      }).join('') +
    '</div>';
  },

  abrirEditarPreco: function (planoId) {
    var plano = PainelAdmin._planos().filter(function (p) { return p.id === planoId; })[0];
    if (!plano) return;
    var preco = PainelAdmin._precoPorId(planoId);
    var mensal = preco ? Number(preco.precoMensal) || 0 : 0;
    var anual = preco && preco.precoAnual !== null && preco.precoAnual !== undefined ? Number(preco.precoAnual) : '';

    var html = '<div class="campo-form">' +
        '<label>Plano</label>' +
        '<input value="' + App.esc(plano.nome) + '" disabled>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form">' +
          '<label>Preço mensal (R$)</label>' +
          '<input type="number" id="adminPrecoMensal" min="0" step="0.01" value="' + mensal + '">' +
        '</div>' +
        '<div class="campo-form">' +
          '<label>Preço anual (R$)</label>' +
          '<input type="number" id="adminPrecoAnual" min="0" step="0.01" value="' + anual + '">' +
        '</div>' +
      '</div>' +
      '<small style="display:block;color:var(--txt2);font-size:12px;line-height:1.5">' +
        'O preço anual é opcional. Deixe em branco se este plano não tiver opção anual.' +
      '</small>';

    App.abrirModal('Editar preço · ' + plano.nome, html, function () {
      PainelAdmin.salvarPrecoPlano(planoId, plano.nome);
    }, 'Salvar preço');
  },

  salvarPrecoPlano: function (planoId, nomePlano) {
    var elMensal = document.getElementById('adminPrecoMensal');
    var elAnual = document.getElementById('adminPrecoAnual');
    if (!elMensal) return;

    var mensal = parseFloat(elMensal.value);
    if (isNaN(mensal) || mensal < 0) {
      App.toast('Informe um preço mensal válido', 'erro');
      return;
    }
    var anualTxt = (elAnual.value || '').trim();
    var anual = anualTxt === '' ? null : parseFloat(anualTxt);
    if (anual !== null && (isNaN(anual) || anual < 0)) {
      App.toast('Informe um preço anual válido ou deixe em branco', 'erro');
      return;
    }

    sb.from('planos_precos').upsert({
      id: planoId,
      nome: nomePlano,
      precoMensal: mensal,
      precoAnual: anual,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: (typeof usuarioAtual !== 'undefined' && usuarioAtual) ? usuarioAtual.id : 'MASTER'
    }, { onConflict: 'id' }).then(function (r) {
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        return;
      }
      App.fecharModal();
      App.toast('Preço atualizado!', 'ok');
      PainelAdmin.carregarDados();
    });
  },

  /* ============ CONVIDAR NOVO CLIENTE ============ */

  _htmlConvite: function () {
    return '<div class="secao-titulo"><span class="ms" style="color:#60a5fa">person_add</span>Convidar novo cliente</div>' +
      '<div style="background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);border-radius:12px;padding:14px;margin-bottom:22px">' +
        '<p style="font-size:12.5px;color:var(--txt2);line-height:1.6;margin:0 0 12px">' +
          'O link abre o cadastro comum. O cliente cria a própria organização e mantém seus dados isolados.' +
        '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<button onclick="PainelAdmin.copiarLinkConvite()" class="btn-admin-share"><span class="ms" style="color:#60a5fa">content_copy</span>Copiar</button>' +
          '<button onclick="PainelAdmin.enviarEmail()" class="btn-admin-share"><span class="ms" style="color:#a78bfa">mail</span>E-mail</button>' +
          '<button onclick="PainelAdmin.enviarWhatsApp()" class="btn-admin-share"><span class="ms" style="color:#22c55e">chat</span>WhatsApp</button>' +
          '<button onclick="PainelAdmin.compartilhar()" class="btn-admin-share"><span class="ms" style="color:#22d3ee">share</span>Compartilhar</button>' +
        '</div>' +
      '</div>';
  },

  /* ============ SOLICITACOES DE MUDANCA DE PLANO ============ */

  _htmlSolicitacoes: function () {
    var titulo = '<div id="painelSecaoSolicitacoes" class="secao-titulo"><span class="ms" style="color:#f59e0b">upgrade</span>Solicitações de mudança de plano</div>';

    if (!PainelAdmin.solicitacoes.length) {
      return titulo + '<div class="vazio-veiculo" style="padding:22px 12px;margin-bottom:22px">' +
        '<span class="ms" style="color:#22c55e">check_circle</span><p>Nenhuma solicitação pendente. Solicitações para o plano Free são aprovadas automaticamente.</p></div>';
    }

    return titulo + '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:22px">' +
      PainelAdmin.solicitacoes.map(PainelAdmin._cardSolicitacao).join('') +
      '</div>';
  },

  _cardSolicitacao: function (s) {
    return '<div style="border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.08);border-radius:12px;padding:12px 14px">' +
      '<div style="font-size:13.5px"><b>' + App.esc(App.nomePlano(s.planoAtual)) + '</b> → ' +
        '<b style="color:#fcd34d">' + App.esc(App.nomePlano(s.planoSolicitado)) + '</b></div>' +
      '<small style="color:var(--txt2)">Organização: ' + App.esc(s.organizacaoId) + '</small>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button onclick="PainelAdmin.resolverSolicitacao(\'' + App.esc(s.id) + '\',\'APROVADA\')" ' +
          'style="flex:1;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);color:#86efac;border-radius:8px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">' +
          '<span class="ms" style="font-size:16px">check</span> Aprovar</button>' +
        '<button onclick="PainelAdmin.resolverSolicitacao(\'' + App.esc(s.id) + '\',\'RECUSADA\')" ' +
          'style="flex:1;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);color:#fca5a5;border-radius:8px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">' +
          '<span class="ms" style="font-size:16px">close</span> Recusar</button>' +
      '</div>' +
    '</div>';
  },

  resolverSolicitacao: function (id, novoStatus) {
    var sol = PainelAdmin.solicitacoes.filter(function (s) { return s.id === id; })[0];
    if (!sol) return;

    var atualizarSolicitacao = sb.from('solicitacoes_plano').update({
      status: novoStatus,
      resolvidoEm: new Date().toISOString()
    }).eq('id', id);

    var atualizarOrgPlano = novoStatus === 'APROVADA'
      ? sb.from('organizacoes').update({
          tipoPlano: sol.planoSolicitado,
          atualizadoEm: new Date().toISOString()
        }).eq('id', sol.organizacaoId)
      : Promise.resolve({ error: null });

    Promise.all([atualizarSolicitacao, atualizarOrgPlano]).then(function (r) {
      var erro = r[0].error || (r[1] && r[1].error);
      if (erro) {
        App.toast('Erro: ' + erro.message, 'erro');
        return;
      }
      App.toast(novoStatus === 'APROVADA' ? 'Plano aprovado!' : 'Solicitação recusada', 'ok');
      PainelAdmin.carregarDados();
    });
  },

  /* ============ GESTAO DE ORGANIZACOES (recolhida por padrao) ============ */

  _organizacoesFiltradas: function () {
    var lista = PainelAdmin.organizacoes;

    if (PainelAdmin._filtroPlano) {
      lista = lista.filter(function (o) { return (o.tipoPlano || 'FREE') === PainelAdmin._filtroPlano; });
    }
    if (PainelAdmin._filtroCortesia === true) {
      lista = lista.filter(function (o) { return o.cortesia === true; });
    }
    var busca = (PainelAdmin._buscaOrg || '').trim().toLowerCase();
    if (busca) {
      lista = lista.filter(function (o) {
        return (o.nome || '').toLowerCase().indexOf(busca) > -1 ||
               (o.id || '').toLowerCase().indexOf(busca) > -1;
      });
    }
    return lista;
  },

  _htmlOrganizacoesSecao: function () {
    var total = PainelAdmin.organizacoes.length;
    var aberto = PainelAdmin._abertoOrganizacoes;

    var chips = [];
    if (PainelAdmin._filtroPlano) {
      var nomePlano = App.nomePlano(PainelAdmin._filtroPlano);
      chips.push('<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(167,139,250,.15);color:#ddd6fe;border-radius:99px;padding:5px 10px;font-size:11.5px;font-weight:600">' +
        '<span class="ms" style="font-size:14px">workspace_premium</span>' + App.esc(nomePlano) +
        ' <span class="ms" style="font-size:14px;cursor:pointer" onclick="event.stopPropagation();PainelAdmin.limparFiltroPlano()">close</span></span>');
    }
    if (PainelAdmin._filtroCortesia === true) {
      chips.push('<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(167,139,250,.15);color:#ddd6fe;border-radius:99px;padding:5px 10px;font-size:11.5px;font-weight:600">' +
        '<span class="ms" style="font-size:14px">redeem</span>Cortesia' +
        ' <span class="ms" style="font-size:14px;cursor:pointer" onclick="event.stopPropagation();PainelAdmin.limparFiltroCortesia()">close</span></span>');
    }

    return '<div id="painelSecaoOrganizacoes" class="secao-titulo" style="cursor:pointer;justify-content:space-between" onclick="PainelAdmin.toggleSecao(\'organizacoes\')">' +
        '<span style="display:flex;align-items:center;gap:8px"><span class="ms" style="color:#22d3ee">apartment</span>Gestão de organizações (' + total + ')</span>' +
        '<span class="ms">' + (aberto ? 'expand_less' : 'expand_more') + '</span>' +
      '</div>' +
      '<div style="' + (aberto ? '' : 'display:none') + ';margin-bottom:22px">' +
        (chips.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + chips.join('') + '</div>' : '') +
        '<input type="text" placeholder="Buscar organização por nome ou ID..." value="' + App.esc(PainelAdmin._buscaOrg) + '" ' +
          'oninput="PainelAdmin.buscarOrganizacoes(this.value)" ' +
          'style="width:100%;background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);color:var(--txt,#e8eefc);' +
          'border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit;margin-bottom:10px">' +
        '<div id="painelAdminOrgLista"></div>' +
      '</div>';
  },

  toggleSecao: function (nome) {
    if (nome === 'organizacoes') PainelAdmin._abertoOrganizacoes = !PainelAdmin._abertoOrganizacoes;
    if (nome === 'usuarios') PainelAdmin._abertoUsuarios = !PainelAdmin._abertoUsuarios;
    if (nome === 'planos') PainelAdmin._abertoPlanos = !PainelAdmin._abertoPlanos;
    if (nome === 'precos') PainelAdmin._abertoPrecos = !PainelAdmin._abertoPrecos;
    PainelAdmin._render();
  },

  abrirSecaoOrganizacoes: function (plano, cortesia) {
    PainelAdmin._filtroPlano = plano;
    PainelAdmin._filtroCortesia = cortesia;
    PainelAdmin._abertoOrganizacoes = true;
    PainelAdmin._render();
    PainelAdmin.rolarPara('painelSecaoOrganizacoes');
  },

  limparFiltroPlano: function () {
    PainelAdmin._filtroPlano = null;
    PainelAdmin._render();
  },

  limparFiltroCortesia: function () {
    PainelAdmin._filtroCortesia = null;
    PainelAdmin._render();
  },

  buscarOrganizacoes: function (texto) {
    PainelAdmin._buscaOrg = texto;
    var el = document.getElementById('painelAdminOrgLista');
    if (el) el.innerHTML = PainelAdmin._renderOrganizacoesListaHtml();
  },

  _renderOrganizacoesLista: function () {
    var el = document.getElementById('painelAdminOrgLista');
    if (el) el.innerHTML = PainelAdmin._renderOrganizacoesListaHtml();
  },

  _renderOrganizacoesListaHtml: function () {
    var lista = PainelAdmin._organizacoesFiltradas();
    if (!lista.length) {
      return '<div class="vazio-veiculo"><p>Nenhuma organização encontrada com esse filtro.</p></div>';
    }
    return '<div style="display:flex;flex-direction:column;gap:12px">' +
      lista.map(PainelAdmin._cardOrganizacao).join('') +
    '</div>';
  },

  _cardOrganizacao: function (o) {
    var cortesia = o.cortesia === true;
    var statusAtivo = String(o.status || '').toUpperCase() === 'ATIVO';

    return '<div style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-left:4px solid ' +
      (cortesia ? '#a78bfa' : '#22d3ee') + ';border-radius:14px;padding:14px">' +
      '<div style="display:flex;align-items:flex-start;gap:10px">' +
        '<span class="ms" style="color:#22d3ee;font-size:24px">apartment</span>' +
        '<div style="flex:1;min-width:0">' +
          '<b style="display:block;font-size:15px">' + App.esc(o.nome || o.id) + '</b>' +
          '<small style="display:block;color:var(--txt2);font-size:11px;overflow-wrap:anywhere">' + App.esc(o.id) + '</small>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;padding:4px 8px;border-radius:99px;background:' +
          (statusAtivo ? 'rgba(34,197,94,.15);color:#86efac' : 'rgba(148,163,184,.15);color:#cbd5e1') + '">' +
          (statusAtivo ? 'ATIVA' : App.esc(o.status || 'SEM STATUS')) + '</span>' +
      '</div>' +

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
        '<button class="btn-admin-share" onclick="PainelAdmin.abrirAlterarPlano(\'' + App.esc(o.id) + '\')">' +
          '<span class="ms" style="color:#60a5fa">workspace_premium</span>Alterar plano</button>' +
        '<button class="btn-admin-share" onclick="PainelAdmin.abrirCortesia(\'' + App.esc(o.id) + '\')">' +
          '<span class="ms" style="color:' + (cortesia ? '#ef4444' : '#a78bfa') + '">' + (cortesia ? 'card_giftcard_off' : 'redeem') + '</span>' +
          (cortesia ? 'Remover cortesia' : 'Conceder cortesia') + '</button>' +
      '</div>' +
    '</div>';
  },

  _organizacaoPorId: function (id) {
    return PainelAdmin.organizacoes.filter(function (o) { return o.id === id; })[0] || null;
  },

  abrirAlterarPlano: function (organizacaoId) {
    var org = PainelAdmin._organizacaoPorId(organizacaoId);
    if (!org) return;

    var opcoes = PainelAdmin._planos().map(function (p) {
      return '<option value="' + App.esc(p.id) + '"' + (p.id === org.tipoPlano ? ' selected' : '') + '>' + App.esc(p.nome) + '</option>';
    }).join('');

    var html = '<div class="campo-form">' +
      '<label>Organização</label>' +
      '<input value="' + App.esc(org.nome || org.id) + '" disabled>' +
      '</div>' +
      '<div class="campo-form">' +
      '<label>Novo plano</label>' +
      '<select id="adminNovoPlano">' + opcoes + '</select>' +
      '<small>Se o novo plano for Free, a organização não precisa de aprovação: fica ativo imediatamente.</small>' +
      '</div>';

    App.abrirModal('Alterar plano', html, function () {
      PainelAdmin.salvarPlano(organizacaoId);
    }, 'Salvar plano');
  },

  salvarPlano: function (organizacaoId) {
    var select = document.getElementById('adminNovoPlano');
    if (!select) return;
    var novoPlano = select.value;

    sb.from('organizacoes').update({
      tipoPlano: novoPlano,
      atualizadoEm: new Date().toISOString()
    }).eq('id', organizacaoId).then(function (r) {
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        return;
      }
      App.fecharModal();
      App.toast('Plano alterado com sucesso!', 'ok');
      PainelAdmin.carregarDados();
    });
  },

  abrirCortesia: function (organizacaoId) {
    var org = PainelAdmin._organizacaoPorId(organizacaoId);
    if (!org) return;

    if (org.cortesia === true) {
      App.confirmar({
        titulo: 'Remover cortesia',
        mensagem: 'A organização continuará no plano atual, mas deixará de ter isenção de cobrança.',
        textoBotao: 'Remover cortesia',
        tipo: 'perigo',
        icone: 'card_giftcard_off',
        aoConfirmar: function () {
          PainelAdmin.salvarCortesia(organizacaoId, false, '');
        }
      });
      return;
    }

    var html = '<div class="campo-form">' +
      '<label>Organização</label>' +
      '<input value="' + App.esc(org.nome || org.id) + '" disabled>' +
      '</div>' +
      '<div class="campo-form">' +
      '<label>Motivo da cortesia</label>' +
      '<input id="adminCortesiaMotivo" maxlength="180" placeholder="Ex.: parceiro, teste beta, família">' +
      '<small>A organização poderá usar gratuitamente todos os recursos do plano selecionado.</small>' +
      '</div>';

    App.abrirModal('Conceder cortesia', html, function () {
      var motivo = document.getElementById('adminCortesiaMotivo').value.trim();
      if (!motivo) {
        App.toast('Informe o motivo da cortesia', 'erro');
        return;
      }
      PainelAdmin.salvarCortesia(organizacaoId, true, motivo);
    }, 'Conceder cortesia');
  },

  salvarCortesia: function (organizacaoId, conceder, motivo) {
    var dados = conceder ? {
      cortesia: true,
      cortesiaMotivo: motivo,
      cortesiaConcedidaEm: new Date().toISOString(),
      cortesiaConcedidaPor: (typeof usuarioAtual !== 'undefined' && usuarioAtual) ? usuarioAtual.id : 'MASTER',
      atualizadoEm: new Date().toISOString()
    } : {
      cortesia: false,
      cortesiaMotivo: null,
      cortesiaConcedidaEm: null,
      cortesiaConcedidaPor: null,
      atualizadoEm: new Date().toISOString()
    };

    sb.from('organizacoes').update(dados).eq('id', organizacaoId).then(function (r) {
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        return;
      }
      App.fecharModal();
      App.toast(conceder ? 'Cortesia concedida!' : 'Cortesia removida', 'ok');
      PainelAdmin.carregarDados();
    });
  },

  /* ============ USUARIOS (recolhido por padrao) ============ */

  _usuariosFiltrados: function () {
    var lista = PainelAdmin.usuarios;

    if (PainelAdmin._filtroStatusUsuario) {
      lista = lista.filter(function (u) { return String(u.status || '').toUpperCase() === PainelAdmin._filtroStatusUsuario; });
    }
    var busca = (PainelAdmin._buscaUsuario || '').trim().toLowerCase();
    if (busca) {
      lista = lista.filter(function (u) {
        return (u.nome || '').toLowerCase().indexOf(busca) > -1 ||
               (u.email || '').toLowerCase().indexOf(busca) > -1;
      });
    }
    return lista;
  },

  _htmlUsuariosSecao: function () {
    var total = PainelAdmin.usuarios.length;
    var aberto = PainelAdmin._abertoUsuarios;

    function chipStatus(valor, label) {
      var sel = PainelAdmin._filtroStatusUsuario === valor;
      return '<button onclick="event.stopPropagation();PainelAdmin.filtrarStatusUsuario(' + (valor ? "'" + valor + "'" : 'null') + ')" ' +
        'style="border:1px solid ' + (sel ? '#3b82f6' : 'var(--linha,#26365c)') + ';background:' + (sel ? 'rgba(59,130,246,.15)' : 'var(--bg2,#111c33)') + ';' +
        'color:' + (sel ? '#93c5fd' : 'var(--txt2)') + ';border-radius:99px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">' + label + '</button>';
    }

    return '<div id="painelSecaoUsuarios" class="secao-titulo" style="cursor:pointer;justify-content:space-between" onclick="PainelAdmin.toggleSecao(\'usuarios\')">' +
        '<span style="display:flex;align-items:center;gap:8px"><span class="ms" style="color:#3b82f6">group</span>Usuários (' + total + ')</span>' +
        '<span class="ms">' + (aberto ? 'expand_less' : 'expand_more') + '</span>' +
      '</div>' +
      '<div style="' + (aberto ? '' : 'display:none') + '">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
          chipStatus(null, 'Todos') + chipStatus('ATIVO', 'Ativos') + chipStatus('INATIVO', 'Inativos') +
        '</div>' +
        '<input type="text" placeholder="Buscar usuário por nome ou e-mail..." value="' + App.esc(PainelAdmin._buscaUsuario) + '" ' +
          'oninput="PainelAdmin.buscarUsuarios(this.value)" ' +
          'style="width:100%;background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);color:var(--txt,#e8eefc);' +
          'border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit;margin-bottom:10px">' +
        '<div id="painelAdminUsuariosLista"></div>' +
      '</div>';
  },

  abrirSecaoUsuarios: function (status) {
    PainelAdmin._filtroStatusUsuario = status;
    PainelAdmin._abertoUsuarios = true;
    PainelAdmin._render();
    PainelAdmin.rolarPara('painelSecaoUsuarios');
  },

  filtrarStatusUsuario: function (status) {
    PainelAdmin._filtroStatusUsuario = status;
    PainelAdmin._render();
  },

  buscarUsuarios: function (texto) {
    PainelAdmin._buscaUsuario = texto;
    var el = document.getElementById('painelAdminUsuariosLista');
    if (el) el.innerHTML = PainelAdmin._renderUsuariosListaHtml();
  },

  _renderUsuariosLista: function () {
    var el = document.getElementById('painelAdminUsuariosLista');
    if (el) el.innerHTML = PainelAdmin._renderUsuariosListaHtml();
  },

  _renderUsuariosListaHtml: function () {
    var lista = PainelAdmin._usuariosFiltrados();
    if (!lista.length) {
      return '<div class="vazio-veiculo"><p>Nenhum usuário encontrado com esse filtro.</p></div>';
    }
    return '<div style="display:flex;flex-direction:column;gap:8px">' +
      lista.map(function (u) {
        var ativo = String(u.status || '').toUpperCase() === 'ATIVO';
        return '<div style="display:flex;align-items:center;gap:10px;background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);border-radius:11px;padding:11px 12px">' +
          '<span class="ms" style="color:' + (u.isMaster ? '#a78bfa' : '#3b82f6') + '">' + (u.isMaster ? 'admin_panel_settings' : 'person') + '</span>' +
          '<div style="flex:1;min-width:0"><b style="display:block;font-size:13.5px">' + App.esc(u.nome || 'Usuário') + '</b>' +
          '<small style="display:block;color:var(--txt2);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + App.esc(u.email || '') + '</small></div>' +
          '<span style="font-size:9.5px;font-weight:700;color:' + (ativo ? '#86efac' : '#cbd5e1') + '">' + (ativo ? 'ATIVO' : App.esc(u.status || '')) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  },

  /* ============ CONVITES PENDENTES (modal sob demanda) ============ */

  abrirConvitesPendentes: function () {
    App.abrirModal('Convites pendentes',
      '<div style="text-align:center;padding:20px 0"><span class="ms" style="font-size:36px;opacity:.5">hourglass_top</span><p style="color:var(--txt2);margin-top:10px">Carregando...</p></div>', null);

    sb.from('convites').select('*').eq('status', 'PENDENTE').order('criadoEm', { ascending: false }).then(function (r) {
      if (r.error) {
        App.abrirModal('Convites pendentes', '<p style="text-align:center;color:var(--txt2)">Erro ao carregar convites.</p>', null);
        return;
      }
      var itens = r.data || [];
      if (!itens.length) {
        App.abrirModal('Convites pendentes',
          '<div style="text-align:center;padding:20px 0;color:var(--txt2)"><span class="ms" style="font-size:44px;opacity:.5">mail</span><p style="margin-top:10px">Nenhum convite pendente.</p></div>', null);
        return;
      }
      var html = '<div style="display:flex;flex-direction:column;gap:10px">' +
        itens.map(function (c) {
          var titulo = c.email || c.nome || c.id;
          var sub = [c.perfil, c.organizacaoId].filter(Boolean).join(' · ');
          return '<div style="background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);border-radius:11px;padding:11px 12px">' +
            '<b style="display:block;font-size:13.5px">' + App.esc(titulo) + '</b>' +
            (sub ? '<small style="display:block;color:var(--txt2);font-size:11.5px;margin-top:2px">' + App.esc(sub) + '</small>' : '') +
          '</div>';
        }).join('') +
      '</div>';
      App.abrirModal('Convites pendentes (' + itens.length + ')', html, null);
    });
  },

  /* ============ CONVITE: LINK, E-MAIL, WHATSAPP, COMPARTILHAR ============ */

  _linkCadastro: function () {
    return window.location.origin + window.location.pathname + '?novaconta=1';
  },

  copiarLinkConvite: function () {
    var link = PainelAdmin._linkCadastro();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        App.toast('Link copiado!', 'ok');
      }).catch(function () {
        PainelAdmin._copiarLinkAlternativo(link);
      });
    } else {
      PainelAdmin._copiarLinkAlternativo(link);
    }
  },

  _copiarLinkAlternativo: function (link) {
    var area = document.createElement('textarea');
    area.value = link;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();

    try {
      document.execCommand('copy');
      App.toast('Link copiado!', 'ok');
    } catch (e) {
      App.toast(link, 'ok');
    }

    document.body.removeChild(area);
  },

  enviarEmail: function () {
    var link = PainelAdmin._linkCadastro();
    var assunto = encodeURIComponent('Convite para usar o CarWay');
    var corpo = encodeURIComponent(
      'Olá!\n\n' +
      'Você foi convidado para conhecer o CarWay.\n\n' +
      'Crie sua conta gratuitamente pelo link abaixo:\n' +
      link + '\n\n' +
      'No CarWay, você poderá organizar veículos, abastecimentos, manutenções, despesas e viagens.'
    );

    window.location.href = 'mailto:?subject=' + assunto + '&body=' + corpo;
  },

  enviarWhatsApp: function () {
    var link = PainelAdmin._linkCadastro();
    var mensagem = encodeURIComponent(
      'Olá! 🚗\n\n' +
      'Você foi convidado para conhecer o CarWay.\n' +
      'Crie sua conta gratuitamente:\n' + link
    );

    window.open('https://wa.me/?text=' + mensagem, '_blank', 'noopener');
  },

  compartilhar: function () {
    var link = PainelAdmin._linkCadastro();

    if (navigator.share) {
      navigator.share({
        title: 'CarWay',
        text: 'Crie sua conta gratuita no CarWay.',
        url: link
      }).catch(function (e) {
        if (e && e.name !== 'AbortError') PainelAdmin.copiarLinkConvite();
      });
      return;
    }

    PainelAdmin.copiarLinkConvite();
  }
};
