/* APP_VERSION: v19.1 */
var sb = null;
var usuarioAtual = null;
var orgAtual = null;
var itiCadastro = null;
var PAGINA_ANTERIOR = 'menu';

/* Estado do filtro de período do Painel (Mês / Ano / Tudo) */
var PAINEL_FILTRO = { modo: 'mes', ano: 0, mes: 0 };
var MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

var App = {
  init: function () {
    if (!window.supabase) {
      alert('Nao consegui carregar o Supabase.');
      return;
    }
    if (!CARWAY_CONFIG.SUPABASE_URL || CARWAY_CONFIG.SUPABASE_URL.indexOf('COLE_AQUI') > -1) {
      alert('Configure o Supabase em js/config.js');
      return;
    }
    sb = window.supabase.createClient(CARWAY_CONFIG.SUPABASE_URL, CARWAY_CONFIG.SUPABASE_ANON_KEY);
    console.log('CarWay: Supabase inicializado');
    App.iniciarCampoTelefone();
    App.aplicarTemaSalvo();
    if (App.detectouLinkResetSenha()) {
      console.log('CarWay: link de reset de senha detectado');
      return;
    }
    if (App.detectouLinkConviteMaster()) {
      console.log('CarWay: link de convite do master detectado');
      return;
    }
    App.verificarSessao();
  },

  /**
   * Convite do MASTER: é apenas um link para a tela de Cadastro comum
   * (ex.: .../?novaconta=1). A pessoa cria a PRÓPRIA organização do
   * zero (mesmo comportamento padrão de quem se cadastra sem convite),
   * então o master nunca vê nem acessa os dados dela — cada um só
   * enxerga o próprio carro. Isso é DIFERENTE do convite de Equipe
   * (que coloca a pessoa DENTRO da organização de quem convidou).
   */
  detectouLinkConviteMaster: function () {
    var params = new URLSearchParams(window.location.search || '');
    if (params.get('novaconta') !== '1') return false;
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {}
    setTimeout(function () { App.irParaCadastro(); }, 50);
    return true;
  },
  detectouLinkResetSenha: function () {
    var hash = window.location.hash || '';
    if (!hash) return false;
    if (hash.indexOf('type=recovery') > -1 ||
        hash.indexOf('type%3Drecovery') > -1) {
      try {
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}
      setTimeout(function () {
        App.mostrarTela('novaSenha');
        var msg = document.getElementById('msgNovaSenha');
        if (msg) {
          msg.textContent = 'Voce veio do link de recuperacao. Escolha sua nova senha.';
          msg.className = 'mensagem ok';
        }
        setTimeout(function () {
          document.getElementById('nsSenha').focus();
        }, 100);
      }, 300);
      return true;
    }
    return false;
  },
  salvarNovaSenha: function (event) {
    event.preventDefault();
    var s1 = document.getElementById('nsSenha').value;
    var s2 = document.getElementById('nsSenha2').value;
    var btn = document.getElementById('btnNovaSenha');
    var msg = document.getElementById('msgNovaSenha');
    if (s1.length < 6) {
      msg.textContent = 'Senha muito curta (mínimo 6 caracteres)';
      msg.className = 'mensagem erro';
      return;
    }
    if (s1 !== s2) {
      msg.textContent = 'As duas senhas não conferem';
      msg.className = 'mensagem erro';
      return;
    }
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Salvando...';
    msg.textContent = '';
    msg.className = 'mensagem';
    sb.auth.updateUser({ password: s1 }).then(function (r) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Salvar nova senha';
      if (r.error) {
        msg.textContent = 'Erro: ' + r.error.message;
        msg.className = 'mensagem erro';
        return;
      }
      msg.textContent = 'Senha alterada! Redirecionando...';
      msg.className = 'mensagem ok';
      setTimeout(function () {
        App.verificarSessao();
      }, 1500);
    }).catch(function (e) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Salvar nova senha';
      msg.textContent = 'Erro: ' + (e.message || '');
      msg.className = 'mensagem erro';
    });
  },
  iniciarCampoTelefone: function () {
    var input = document.getElementById('cadTelefone');
    if (!input || !window.intlTelInput) return;
    itiCadastro = window.intlTelInput(input, {
      initialCountry: 'br',
      preferredCountries: ['br', 'pt', 'us', 'ao', 'mz'],
      separateDialCode: true,
      utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.4/build/js/utils.js',
      autoPlaceholder: 'aggressive',
      formatOnDisplay: true,
      nationalMode: false
    });
  },
  verificarSessao: function () {
    sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) {
        App.carregarPerfil(r.data.session.user);
      } else {
        App.mostrarTela('login');
      }
    });
    sb.auth.onAuthStateChange(function (evento, sessao) {
      if (evento === 'SIGNED_IN' && sessao) App.carregarPerfil(sessao.user);
      else if (evento === 'SIGNED_OUT') App.mostrarTela('login');
    });
  },
  carregarPerfil: function (user, tentativa) {
    if (!user) return;
    tentativa = tentativa || 1;
    var MAX = 5;
    sb.from('usuarios').select('*').eq('auth_id', user.id).maybeSingle().then(function (r) {
      if (r.error) { App.mostrarErroLogin('Erro ao carregar dados.'); return; }
      if (!r.data) {
        if (tentativa < MAX) {
          setTimeout(function () { App.carregarPerfil(user, tentativa + 1); }, 400);
          return;
        }
        App.mostrarErroLogin('Usuario nao encontrado.');
        return;
      }
      usuarioAtual = r.data;
      return sb.from('membros_organizacao').select('*').eq('usuarioId', usuarioAtual.id).eq('status', 'ATIVO').limit(1).then(function (r2) { return r2; });
    }).then(function (r) {
      if (!r) return;
      if (r.error || !r.data || !r.data.length) {
        App.mostrarErroLogin('Sem equipe vinculada.');
        return;
      }
      var membro = r.data[0];
      return sb.from('organizacoes').select('*').eq('id', membro.organizacaoId).single().then(function (r3) {
        if (r3.error || !r3.data) { App.mostrarErroLogin('Organizacao nao encontrada.'); return; }
        orgAtual = r3.data;
        orgAtual._meuPerfil = membro.perfil;
        App.entrarNoApp();
      });
    }).catch(function (e) {
      console.error('CarWay:', e);
      App.mostrarErroLogin('Erro: ' + (e.message || 'desconhecido'));
    });
  },
  entrarNoApp: function () {
    var telas = document.querySelectorAll('.tela');
    for (var i = 0; i < telas.length; i++) telas[i].classList.remove('ativa');
    document.getElementById('topbar').classList.remove('oculto');
    document.getElementById('conteudo').classList.remove('oculto');
    var primeiroNome = (usuarioAtual.nome || '').split(' ')[0];
    document.getElementById('nomeUsuarioTopo').textContent = primeiroNome;
    document.getElementById('saudacaoNome').textContent = primeiroNome;
    PAGINA_ANTERIOR = 'menu';
    App.irParaMenu();
    App.renderBarraVeiculoGlobal();
    /* Carrega os alertas de revisão em segundo plano, já no login,
       para o sininho do topo mostrar a badge sem precisar abrir o Painel. */
    App.carregarAlertas().then(function (itens) {
      App.atualizarSininho(itens);
    }).catch(function (e) { console.error('CarWay alertas:', e); });
  },
  irParaMenu: function () {
    App.mostrarTelaApp('menu');
    App.setTitulo('CarWay', 'Menu');
    App.esconderTabbar();
    App.esconderBotaoVoltar();
    App.renderMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irPara: function (pg) {
    if (pg !== 'menu') PAGINA_ANTERIOR = pg;
    App.mostrarTelaApp(pg);
    App.mostrarTabbar();
    App.atualizarAbaAtiva(pg);
    App.mostrarBotaoVoltar();
    var titulos = {
      painel:         ['Painel',         'Resumo dos gastos'],
      veiculos:       ['Meus veículos',  'Cadastro e comparativo'],
      viagens:        ['Viagens',        'Planejamento e gastos'],
      abastecimentos: ['Abastecimento',  'Consumo e custos'],
      manutencao:     ['Manutenção',     'Revisões por km e tempo'],
      documentos:     ['Documentos',     'CRLV, IPVA, seguro e mais'],
      equipe:         ['Equipe',         'Membros e convites'],
      configuracoes:  ['Configurações',  'Sua conta'],
      'painel-admin': ['Painel Administrativo', 'Usuários, planos e solicitações']
    };
    var t = titulos[pg] || ['CarWay', ''];
    App.setTitulo(t[0], t[1]);
    if (pg === 'veiculos') Veiculos.carregarLista();
    else if (pg === 'abastecimentos') Abastecimentos.carregarLista();
    else if (pg === 'manutencao') Manutencoes.carregarTudo();
    else if (pg === 'despesas') Despesas.carregarLista();
    else if (pg === 'viagens') Viagens.carregarLista();
    else if (pg === 'documentos') Documentos.carregarLista();
    else if (pg === 'equipe') Equipe.carregarLista();
    else if (pg === 'configuracoes') App.renderConfiguracoes();
    else if (pg === 'painel-admin') PainelAdmin.carregarDados();
    else if (pg === 'painel') App.renderPainel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaFormVeiculo: function (id) {
    App.mostrarTelaApp('veiculo-form');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('veiculos');
    App.mostrarBotaoVoltar();
    App.setTitulo(id ? 'Editar veículo' : 'Novo veículo', 'Cadastro');
    Veiculos.abrirFormulario(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaFormAbastecimento: function (id, veiculoIdPre) {
    App.mostrarTelaApp('abastecimento-form');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('abastecimentos');
    App.mostrarBotaoVoltar();
    App.setTitulo(id ? 'Editar abastecimento' : 'Novo abastecimento', 'Lançamento');
    Abastecimentos.abrirForm(id, veiculoIdPre);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
    irParaFormManutencao: function (id, planoIdPre, veiculoIdPre) {
    App.mostrarTelaApp('manutencao-form');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('manutencao');
    App.mostrarBotaoVoltar();
    App.setTitulo(id ? 'Editar manutenção' : 'Nova manutenção', 'Lançamento');
    Manutencoes.abrirForm(id, planoIdPre, veiculoIdPre);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaFormPlano: function (id) {
    App.mostrarTelaApp('plano-form');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('manutencao');
    App.mostrarBotaoVoltar();
    App.setTitulo(id ? 'Editar item do plano' : 'Novo item do plano', 'Plano de manutenção');
    Manutencoes.abrirFormPlano(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
    irParaFormDespesa: function (id) {
    App.mostrarTelaApp('despesa-form');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('despesas');
    App.mostrarBotaoVoltar();
    App.setTitulo(id ? 'Editar despesa' : 'Nova despesa', 'Lançamento');
    Despesas.abrirForm(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaFormViagem: function (id) {
    App.mostrarTelaApp('viagem-plano');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('viagens');
    App.mostrarBotaoVoltar();
    App.setTitulo(id ? 'Editar viagem' : 'Planejar viagem', 'Rota, autonomia e paradas');
    Viagens.abrirPlanejador(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaDetalheViagem: function (id) {
    App.mostrarTelaApp('viagem-detalhe');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('viagens');
    App.mostrarBotaoVoltar();
    App.setTitulo('Detalhes da viagem', 'Gastos e lançamentos');
    Viagens.abrirDetalhe(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaEncerrarViagem: function (id) {
    App.mostrarTelaApp('viagem-encerrar');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('viagens');
    App.mostrarBotaoVoltar();
    App.setTitulo('Encerrar viagem', 'KM e data');
    Viagens.abrirEncerrar(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaFormDocumento: function (id, veiculoIdPre) {
    App.mostrarTelaApp('documento-form');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('documentos');
    App.mostrarBotaoVoltar();
    App.setTitulo(id ? 'Editar documento' : 'Novo documento', 'CRLV, IPVA, seguro e mais');
    Documentos.abrirForm(id, veiculoIdPre);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaFormConvite: function () {
    App.mostrarTelaApp('convite-form');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('equipe');
    App.mostrarBotaoVoltar();
    App.setTitulo('Convidar membro', 'Equipe');
    Equipe.abrirFormConvite();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaFormPerfil: function () {
    App.mostrarTelaApp('perfil-form');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('configuracoes');
    App.mostrarBotaoVoltar();
    App.setTitulo('Meu perfil', 'Editar dados');
    Conta.abrirFormPerfil();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  irParaDetalhePlano: function () {
    App.mostrarTelaApp('plano-detalhe');
    App.mostrarTabbar();
    App.atualizarAbaAtiva('configuracoes');
    App.mostrarBotaoVoltar();
    App.setTitulo('Meu plano', App.nomePlano(orgAtual.tipoPlano));
    Conta.abrirDetalhePlano();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  voltar: function () {
    var pgAtiva = App.paginaAtiva();
    if (pgAtiva === 'veiculo-form') {
      App.irPara('veiculos');
      return;
    }
    if (pgAtiva === 'abastecimento-form') {
      App.irPara('abastecimentos');
      return;
    }
    if (pgAtiva === 'manutencao-form' || pgAtiva === 'plano-form') {
      App.irPara('manutencao');
      return;
    }
    if (pgAtiva === 'despesa-form') {
      App.irPara('despesas');
      return;
    }
    if (pgAtiva === 'viagem-form' ||pgAtiva === 'viagem-plano') {
      App.irPara('viagens');
      return;
    }
    if (pgAtiva === 'viagem-detalhe') {
      App.irPara('viagens');
      return;
    }
    if (pgAtiva === 'viagem-encerrar') {
      App.irPara('viagens');
      return;
    }
    if (pgAtiva === 'documento-form') {
      App.irPara('documentos');
      return;
    }
    if (pgAtiva === 'convite-form') {
      App.irPara('equipe');
      return;
    }
    if (pgAtiva === 'perfil-form' || pgAtiva === 'plano-detalhe' || pgAtiva === 'painel-admin') {
      App.irPara('configuracoes');
      return;
    }
    if (pgAtiva !== 'menu') {
      App.irParaMenu();
      return;
    }
  },
  paginaAtiva: function () {
    var pgs = document.querySelectorAll('.tela-pagina.ativa');
    for (var i = 0; i < pgs.length; i++) return pgs[i].id.replace('pg-', '');
    return '';
  },
  mostrarTelaApp: function (nome) {
    var paginas = document.querySelectorAll('.tela-pagina');
    for (var i = 0; i < paginas.length; i++) paginas[i].classList.remove('ativa');
    var el = document.getElementById('pg-' + nome);
    if (el) el.classList.add('ativa');
  },
  setTitulo: function (titulo, sub) {
    document.getElementById('tituloPagina').textContent = titulo;
    document.getElementById('subPagina').textContent = sub;
  },
  mostrarTabbar: function () { document.getElementById('tabbar').classList.remove('oculto'); },
  esconderTabbar: function () { document.getElementById('tabbar').classList.add('oculto'); },
  atualizarAbaAtiva: function (pg) {
    var tabs = document.querySelectorAll('#tabbar .tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('ativa', tabs[i].dataset.pg === pg);
    }
  },
  mostrarBotaoVoltar: function () { document.getElementById('btnVoltarTopo').classList.remove('oculto'); },
  esconderBotaoVoltar: function () { document.getElementById('btnVoltarTopo').classList.add('oculto'); },
  /* ============ PAINEL ============ */

  /**
   * Busca, uma única vez por visita ao Painel, todos os lançamentos
   * da organização (sem filtro de data) para permitir trocar de
   * mês/ano/tudo instantaneamente, sem nova consulta ao Supabase a
   * cada clique.
   */
  carregarDadosPainel: function () {
    if (App._painelRaw) return Promise.resolve(App._painelRaw);
    return Promise.all([
      sb.from('abastecimentos').select('valorTotal, data').eq('organizacaoId', orgAtual.id),
      sb.from('despesas').select('valor, data').eq('organizacaoId', orgAtual.id),
      sb.from('manutencoes').select('custo, data').eq('organizacaoId', orgAtual.id),
      sb.from('viagens').select('id, dataInicio').eq('organizacaoId', orgAtual.id)
    ]).then(function (r) {
      App._painelRaw = {
        abastecimentos: r[0].data || [],
        despesas: r[1].data || [],
        manutencoes: r[2].data || [],
        viagens: r[3].data || []
      };
      return App._painelRaw;
    });
  },

  painelNoPeriodo: function (dataStr) {
    if (PAINEL_FILTRO.modo === 'tudo') return true;
    if (!dataStr) return false;
    var s = String(dataStr);
    if (PAINEL_FILTRO.modo === 'ano') return s.substring(0, 4) === String(PAINEL_FILTRO.ano);
    return s.substring(0, 7) === (PAINEL_FILTRO.ano + '-' + ('0' + PAINEL_FILTRO.mes).slice(-2));
  },

  painelRotuloPeriodo: function () {
    if (PAINEL_FILTRO.modo === 'tudo') return 'Desde o início';
    if (PAINEL_FILTRO.modo === 'ano') return 'Ano de ' + PAINEL_FILTRO.ano;
    return MESES_PT[PAINEL_FILTRO.mes - 1] + ' de ' + PAINEL_FILTRO.ano;
  },

  painelAnosDisponiveis: function () {
    var d = App._painelRaw;
    var set = {};
    if (d) {
      ['abastecimentos', 'despesas', 'manutencoes'].forEach(function (k) {
        (d[k] || []).forEach(function (x) { if (x.data) set[String(x.data).substring(0, 4)] = 1; });
      });
      (d.viagens || []).forEach(function (v) { if (v.dataInicio) set[String(v.dataInicio).substring(0, 4)] = 1; });
    }
    set[String(new Date().getFullYear())] = 1;
    return Object.keys(set).sort().reverse();
  },

  calcPeriodoPainel: function () {
    var d = App._painelRaw || { abastecimentos: [], despesas: [], manutencoes: [], viagens: [] };
    var totalAbs = 0, totalDesp = 0, totalManut = 0, qtdAbs = 0, qtdDesp = 0, qtdManut = 0, qtdViagens = 0;

    d.abastecimentos.forEach(function (x) {
      if (!App.painelNoPeriodo(x.data)) return;
      totalAbs += Number(x.valorTotal) || 0; qtdAbs++;
    });
    d.despesas.forEach(function (x) {
      if (!App.painelNoPeriodo(x.data)) return;
      totalDesp += Number(x.valor) || 0; qtdDesp++;
    });
    d.manutencoes.forEach(function (x) {
      if (!App.painelNoPeriodo(x.data)) return;
      totalManut += Number(x.custo) || 0; qtdManut++;
    });
    d.viagens.forEach(function (v) {
      if (App.painelNoPeriodo(v.dataInicio)) qtdViagens++;
    });

    return {
      totalAbs: totalAbs, totalDesp: totalDesp, totalManut: totalManut,
      total: totalAbs + totalDesp + totalManut,
      qtdAbs: qtdAbs, qtdDesp: qtdDesp, qtdManut: qtdManut, qtdViagens: qtdViagens,
      qtdLancamentos: qtdAbs + qtdDesp + qtdManut
    };
  },

  renderFiltro: function () {
    var el = document.getElementById('filtroPainel');
    if (!el) return;

    var anos = App.painelAnosDisponiveis();
    var htmlMes = MESES_PT.map(function (m, i) {
      return '<option value="' + (i + 1) + '"' + ((i + 1) === PAINEL_FILTRO.mes ? ' selected' : '') + '>' + m + '</option>';
    }).join('');
    var htmlAno = anos.map(function (a) {
      return '<option value="' + a + '"' + (String(a) === String(PAINEL_FILTRO.ano) ? ' selected' : '') + '>' + a + '</option>';
    }).join('');

    function estiloAba(sel) {
      return 'flex:1;background:' + (sel ? 'var(--azul,#3b82f6)' : 'transparent') +
        ';color:' + (sel ? '#fff' : 'var(--txt2,#93a4c8)') +
        ';border:0;border-radius:8px;padding:8px 4px;font-size:12.5px;font-weight:600;cursor:pointer';
    }
    var estiloSelect = 'flex:1;background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);' +
      'color:var(--txt,#e8eefc);border-radius:9px;padding:10px 8px;font-size:13.5px;font-weight:600';
    var estiloNav = 'background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);color:var(--azul2,#60a5fa);' +
      'width:36px;height:38px;border-radius:9px;display:grid;place-items:center;cursor:pointer;flex:none';

    var campos;
    if (PAINEL_FILTRO.modo === 'mes') {
      campos =
        '<button style="' + estiloNav + '" onclick="App.navMes(-1)"><span class="ms">chevron_left</span></button>' +
        '<select style="' + estiloSelect + '" onchange="App.setMes(this.value)">' + htmlMes + '</select>' +
        '<select style="' + estiloSelect + ';flex:0 0 88px" onchange="App.setAno(this.value)">' + htmlAno + '</select>' +
        '<button style="' + estiloNav + '" onclick="App.navMes(1)"><span class="ms">chevron_right</span></button>';
    } else if (PAINEL_FILTRO.modo === 'ano') {
      campos =
        '<button style="' + estiloNav + '" onclick="App.navAno(-1)"><span class="ms">chevron_left</span></button>' +
        '<select style="' + estiloSelect + '" onchange="App.setAno(this.value)">' + htmlAno + '</select>' +
        '<button style="' + estiloNav + '" onclick="App.navAno(1)"><span class="ms">chevron_right</span></button>';
    } else {
      campos = '<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;' +
        'color:var(--txt2,#93a4c8);font-size:13px;padding:10px;background:var(--bg2,#111c33);border-radius:9px;' +
        'border:1px solid var(--linha,#26365c)"><span class="ms">all_inclusive</span>Todos os lançamentos</div>';
    }

    el.innerHTML =
      '<div style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-radius:16px;' +
      'padding:10px;margin-bottom:14px">' +
        '<div style="display:flex;gap:5px;background:var(--bg2,#111c33);border-radius:10px;padding:4px;margin-bottom:9px">' +
          '<button style="' + estiloAba(PAINEL_FILTRO.modo === 'mes') + '" onclick="App.setModoPainel(\'mes\')">Mês</button>' +
          '<button style="' + estiloAba(PAINEL_FILTRO.modo === 'ano') + '" onclick="App.setModoPainel(\'ano\')">Ano</button>' +
          '<button style="' + estiloAba(PAINEL_FILTRO.modo === 'tudo') + '" onclick="App.setModoPainel(\'tudo\')">Tudo</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:7px">' + campos + '</div>' +
      '</div>';
  },

  setModoPainel: function (m) { PAINEL_FILTRO.modo = m; App.renderFiltro(); App.renderPainelResumo(); },
  setMes: function (v) { PAINEL_FILTRO.mes = parseInt(v, 10); App.renderFiltro(); App.renderPainelResumo(); },
  setAno: function (v) { PAINEL_FILTRO.ano = parseInt(v, 10); App.renderFiltro(); App.renderPainelResumo(); },
  navMes: function (d) {
    PAINEL_FILTRO.mes += d;
    if (PAINEL_FILTRO.mes > 12) { PAINEL_FILTRO.mes = 1; PAINEL_FILTRO.ano++; }
    if (PAINEL_FILTRO.mes < 1) { PAINEL_FILTRO.mes = 12; PAINEL_FILTRO.ano--; }
    App.renderFiltro(); App.renderPainelResumo();
  },
  navAno: function (d) { PAINEL_FILTRO.ano += d; App.renderFiltro(); App.renderPainelResumo(); },

  renderPainelResumo: function () {
    var p = App.calcPeriodoPainel();
    document.getElementById('prValor').textContent = App.moeda(p.total);
    document.getElementById('prDetalhes').textContent = p.qtdLancamentos > 0
      ? p.qtdAbs + ' abastecimento(s) · ' + p.qtdManut + ' manutenção(ões) · ' + p.qtdViagens + ' viagem(ns)'
      : 'Sem lançamentos neste período';

    App._painelDados = { totalAbs: p.totalAbs, totalDesp: p.totalDesp, totalManut: p.totalManut, total: p.total };

    var subDinheiro = p.total > 0 ? (App.moedaCurta(p.total) + ' no período') : 'R$ 0,00 no período';

    var alertasItens = App._alertasCache || [];
    var vencidos = alertasItens.filter(function (x) { return x.status === 'vencido'; }).length;
    var atencaoQtd = alertasItens.filter(function (x) { return x.status === 'atencao'; }).length;
    var subAlertas;
    if (vencidos > 0 && atencaoQtd > 0) subAlertas = vencidos + ' vencido(s), ' + atencaoQtd + ' próximo(s)';
    else if (vencidos > 0) subAlertas = vencidos + ' vencido(s)';
    else if (atencaoQtd > 0) subAlertas = atencaoQtd + ' próximo(s)';
    else subAlertas = 'Tudo em dia';
    /* Vermelho = referência negativa (vencido/crítico); amarelo = atenção
       (próximo do vencimento, ainda não vencido); verde = tudo em dia. */
    var corAlertas = vencidos > 0 ? 'vermelho' : (atencaoQtd > 0 ? 'amarelo' : 'verde');

    /* Subtítulo/cor do hub de Documentos (dados carregados em paralelo por renderPainel) */
    var docs = (App._documentosCache && App._documentosCache.documentos) || [];
    var docsVencidos = docs.filter(function (x) { return x._status === 'vencido'; }).length;
    var docsAtencao = docs.filter(function (x) { return x._status === 'atencao'; }).length;
    var subDocumentos;
    if (docsVencidos > 0 && docsAtencao > 0) subDocumentos = docsVencidos + ' vencido(s), ' + docsAtencao + ' próximo(s)';
    else if (docsVencidos > 0) subDocumentos = docsVencidos + ' vencido(s)';
    else if (docsAtencao > 0) subDocumentos = docsAtencao + ' próximo(s)';
    else if (docs.length > 0) subDocumentos = docs.length + ' em dia';
    else subDocumentos = 'Nenhum cadastrado';
    var corDocumentos = docsVencidos > 0 ? 'vermelho' : (docsAtencao > 0 ? 'amarelo' : (docs.length > 0 ? 'verde' : 'azul'));

    /* Subtítulo do hub de Equipe (dados carregados em paralelo por renderPainel) */
    var eq = App._equipeResumo || { membros: 0, pendentes: 0 };
    var subEquipe = eq.pendentes > 0
      ? eq.membros + ' membro(s), ' + eq.pendentes + ' convite(s) pendente(s)'
      : eq.membros + ' membro(s)';
    var corEquipe = eq.pendentes > 0 ? 'amarelo' : 'verde';

    var hubsHtml = [
      { ico: 'notifications_active', cor: corAlertas, titulo: 'Alertas de revisão', sub: subAlertas, fn: 'App.abrirHubAlertas()' },
      { ico: 'folder_shared', cor: corDocumentos, titulo: 'Documentos', sub: subDocumentos, fn: "App.irPara('documentos')" },
      { ico: 'group', cor: corEquipe, titulo: 'Equipe', sub: subEquipe, fn: "App.irPara('equipe')" },
      { ico: 'savings', cor: 'ciano', titulo: 'Onde vai meu dinheiro', sub: subDinheiro, fn: 'App.abrirHubDinheiro()' },
      { ico: 'bar_chart', cor: 'amarelo', titulo: 'Gastos por mês', sub: 'Últimos 6 meses', fn: 'App.abrirHubMeses()' },
      { ico: 'speed', cor: 'roxo', titulo: 'Consumo dos veículos', sub: 'Comparar km/L', fn: 'App.abrirHubConsumo()' }
    ].map(function (h) {
      return '<button class="hub" onclick="' + h.fn + '">' +
        '<div class="hub-icone ' + h.cor + '"><span class="ms">' + h.ico + '</span></div>' +
        '<div class="hub-txt"><b>' + h.titulo + '</b><small>' + h.sub + '</small></div>' +
        '<span class="ms hub-seta">chevron_right</span>' +
      '</button>';
    }).join('');

    document.getElementById('hubsGrid').innerHTML = hubsHtml;
  },

  renderPainel: function () {
    document.getElementById('prValor').textContent = 'Carregando...';
    document.getElementById('prDetalhes').textContent = '';
    document.getElementById('hubsGrid').innerHTML = '';

    var hoje = new Date();
    if (!PAINEL_FILTRO.ano) PAINEL_FILTRO.ano = hoje.getFullYear();
    if (!PAINEL_FILTRO.mes) PAINEL_FILTRO.mes = hoje.getMonth() + 1;

    App.renderFiltro();

    App._painelRaw = null;
    App._alertasCache = null; /* recarrega os alertas sempre que o Painel é aberto */
    App._documentosCache = null; /* idem para o resumo de documentos no hub */
    App._equipeResumo = null; /* idem para o resumo de equipe no hub */
    Promise.all([
      App.carregarDadosPainel(),
      App.carregarAlertas(),
      App.carregarDocumentosResumo(),
      App.carregarEquipeResumo()
    ]).then(function (resultados) {
      App.atualizarSininho(resultados[1]);
      App.renderFiltro();
      App.renderPainelResumo();
    }).catch(function (e) {
      console.error('CarWay painel:', e);
      document.getElementById('prValor').textContent = 'R$ 0,00';
      document.getElementById('prDetalhes').textContent = 'Erro ao carregar';
    });
  },

  /**
   * Modal com o detalhamento do gasto do período selecionado, por
   * categoria (Combustível / Despesas / Manutenção).
   */
  abrirHubDinheiro: function () {
    var d = App.calcPeriodoPainel();

    var linhas = [
      { nome: 'Combustível', valor: d.totalAbs, cor: '#3b82f6' },
      { nome: 'Despesas', valor: d.totalDesp, cor: '#22c55e' },
      { nome: 'Manutenção', valor: d.totalManut, cor: '#f59e0b' }
    ];

    var cabecalho = '<div style="display:flex;align-items:center;gap:7px;background:var(--bg2,#111c33);' +
      'border:1px solid var(--linha,#26365c);border-radius:11px;padding:9px 12px;margin-bottom:14px;' +
      'font-size:12.5px;color:var(--txt2,#93a4c8);font-weight:600">' +
      '<span class="ms" style="font-size:17px;color:var(--azul2,#60a5fa)">event</span>' +
      App.painelRotuloPeriodo() + '</div>';

    if (d.total <= 0) {
      App.abrirModal('Onde vai meu dinheiro',
        cabecalho +
        '<div style="text-align:center;padding:20px 0;color:var(--txt2)">' +
          '<span class="ms" style="font-size:48px;opacity:.5">savings</span>' +
          '<p style="margin-top:12px">Nenhum gasto lançado neste período.</p>' +
        '</div>', null);
      return;
    }

    var html = cabecalho + '<div style="display:flex;flex-direction:column;gap:14px">' +
      linhas.map(function (l) {
        var pct = d.total > 0 ? Math.round((l.valor / d.total) * 100) : 0;
        return '<div>' +
          '<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px">' +
            '<b>' + l.nome + '</b><span>' + App.moeda(l.valor) + ' (' + pct + '%)</span>' +
          '</div>' +
          '<div style="height:8px;border-radius:4px;background:rgba(148,163,184,.2);overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:' + l.cor + '"></div>' +
          '</div>' +
        '</div>';
      }).join('') +
      '<div style="border-top:1px solid rgba(148,163,184,.2);padding-top:12px;display:flex;justify-content:space-between;font-size:15px">' +
        '<b>Total no período</b><b>' + App.moeda(d.total) + '</b>' +
      '</div>' +
    '</div>';

    App.abrirModal('Onde vai meu dinheiro', html, null);
  },

  /**
   * Modal com o total gasto (abastecimentos + despesas + manutenções)
   * em cada um dos últimos 6 meses, em formato de gráfico de barras.
   */
  abrirHubMeses: function () {
    var hoje = new Date();
    var meses = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push({
        ano: d.getFullYear(),
        mes: d.getMonth(),
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        atual: (PAINEL_FILTRO.modo === 'mes' && PAINEL_FILTRO.ano === d.getFullYear() && PAINEL_FILTRO.mes === (d.getMonth() + 1))
      });
    }

    var raw = App._painelRaw || { abastecimentos: [], despesas: [], manutencoes: [] };
    var todos = []
      .concat((raw.abastecimentos || []).map(function (x) { return { data: x.data, valor: Number(x.valorTotal) || 0 }; }))
      .concat((raw.despesas || []).map(function (x) { return { data: x.data, valor: Number(x.valor) || 0 }; }))
      .concat((raw.manutencoes || []).map(function (x) { return { data: x.data, valor: Number(x.custo) || 0 }; }));

    var totais = meses.map(function (m) {
      var soma = todos.filter(function (x) {
        if (!x.data) return false;
        var partes = String(x.data).split('-');
        return Number(partes[0]) === m.ano && (Number(partes[1]) - 1) === m.mes;
      }).reduce(function (s, x) { return s + x.valor; }, 0);
      return { label: m.label, valor: soma, atual: m.atual };
    });

    var maxValor = Math.max.apply(null, totais.map(function (t) { return t.valor; }).concat([1]));

    var html = '<div style="display:flex;align-items:flex-end;gap:10px;height:170px;padding:10px 0">' +
      totais.map(function (t) {
        var alturaPct = Math.max(4, Math.round((t.valor / maxValor) * 100));
        var destaque = t.atual ? ';outline:1px solid rgba(59,130,246,.5);background:rgba(59,130,246,.08)' : '';
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;' +
          'height:100%;border-radius:9px;padding:3px' + destaque + '">' +
            '<small style="font-size:11px;color:var(--txt2);margin-bottom:4px">' + (t.valor > 0 ? App.moedaCurta(t.valor) : '') + '</small>' +
            '<div style="width:100%;max-width:32px;height:' + alturaPct + '%;background:linear-gradient(180deg,#22d3ee,#3b82f6);border-radius:6px 6px 0 0"></div>' +
            '<small style="font-size:12px;margin-top:6px;text-transform:capitalize">' + t.label + '</small>' +
          '</div>';
      }).join('') +
    '</div>';

    App.abrirModal('Gastos por mês', html, null);
  },

  /**
   * Calcula km/L e km/Tanque a partir de uma lista de abastecimentos
   * de UM veículo. Algoritmo: só usa o trecho entre dois abastecimentos
   * consecutivos com "tanque cheio" marcado (é o único jeito confiável
   * de medir consumo real, já que abastecimentos parciais não fecham
   * a conta de litros consumidos). Entre cada par de tanques cheios,
   * km_percorrido = diferença de KM; litros_consumidos = soma dos
   * litros de todos os abastecimentos DEPOIS do primeiro tanque cheio
   * até o segundo (inclusive). O km/L final é a média ponderada
   * (km total / litros totais) de todos os trechos válidos.
   *
   * @param {Array} abs - abastecimentos do veículo: {km, litros, tanqueCheio, data}
   * @param {Number} capacidadeTanque - litros do tanque do veículo (opcional)
   * @returns {Object} { kmL, kmTanque, temDados, trechos }
   */
  calcularConsumo: function (abs, capacidadeTanque) {
    var validos = (abs || [])
      .filter(function (a) { return Number(a.km) > 0 && Number(a.litros) > 0; })
      .slice()
      .sort(function (a, b) {
        if (Number(a.km) !== Number(b.km)) return Number(a.km) - Number(b.km);
        return String(a.data).localeCompare(String(b.data));
      });

    var kmTotal = 0, litrosTotal = 0, trechos = 0;
    var ultimoCheioIdx = -1;

    for (var i = 0; i < validos.length; i++) {
      var cheio = String(validos[i].tanqueCheio).toUpperCase() === 'SIM';
      if (ultimoCheioIdx === -1) {
        if (cheio) ultimoCheioIdx = i;
        continue;
      }
      /* soma litros de todos os abastecimentos desde o proximo apos o ultimo cheio ate aqui */
      if (cheio) {
        var kmSegmento = Number(validos[i].km) - Number(validos[ultimoCheioIdx].km);
        var litrosSegmento = 0;
        for (var j = ultimoCheioIdx + 1; j <= i; j++) litrosSegmento += Number(validos[j].litros) || 0;
        if (kmSegmento > 0 && litrosSegmento > 0) {
          kmTotal += kmSegmento;
          litrosTotal += litrosSegmento;
          trechos++;
        }
        ultimoCheioIdx = i;
      }
    }

    var kmL = (litrosTotal > 0) ? (kmTotal / litrosTotal) : 0;
    var kmTanque = (kmL > 0 && capacidadeTanque > 0) ? (kmL * capacidadeTanque) : 0;

    return { kmL: kmL, kmTanque: kmTanque, temDados: trechos > 0, trechos: trechos };
  },

  /**
   * Hub "Consumo dos veículos": compara km/L e km/Tanque de todos os
   * veículos da organização, usando App.calcularConsumo sobre o
   * histórico completo de abastecimentos de cada um.
   */
  abrirHubConsumo: function () {
    App.abrirModal('Consumo dos veículos',
      '<div style="text-align:center;padding:20px 0">' +
        '<span class="ms" style="font-size:40px;opacity:.5">hourglass_top</span>' +
        '<p style="margin-top:10px;color:var(--txt2)">Carregando...</p>' +
      '</div>', null);

    Promise.all([
      sb.from('veiculos').select('id, nome, placa, tanque, combustivel').eq('organizacaoId', orgAtual.id).order('nome'),
      sb.from('abastecimentos').select('veiculoId, km, litros, tanqueCheio, data').eq('organizacaoId', orgAtual.id)
    ]).then(function (r) {
      var veiculos = r[0].data || [];
      var abastecimentos = r[1].data || [];

      if (veiculos.length === 0) {
        App.abrirModal('Consumo dos veículos',
          '<div style="text-align:center;padding:20px 0;color:var(--txt2)">' +
            '<span class="ms" style="font-size:48px;opacity:.5">directions_car</span>' +
            '<p style="margin-top:12px">Nenhum veículo cadastrado ainda.</p>' +
          '</div>', null);
        return;
      }

      var linhas = veiculos.map(function (v) {
        var absDoVeic = abastecimentos.filter(function (a) { return a.veiculoId === v.id; });
        var c = App.calcularConsumo(absDoVeic, v.tanque);
        return { veiculo: v, consumo: c };
      });

      var comMaisDados = linhas.filter(function (l) { return l.consumo.temDados; });
      var melhorKmL = comMaisDados.length ? Math.max.apply(null, comMaisDados.map(function (l) { return l.consumo.kmL; })) : 0;

      var html = '<div style="display:flex;flex-direction:column;gap:12px">' +
        linhas.map(function (l) {
          var v = l.veiculo, c = l.consumo;
          var destaque = (c.temDados && c.kmL === melhorKmL) ? 'border:1px solid rgba(34,197,94,.5);background:rgba(34,197,94,.06)' : 'border:1px solid var(--linha,#26365c)';
          var kmLTxt = c.temDados ? c.kmL.toFixed(1).replace('.', ',') + ' km/L' : 'Sem dados suficientes';
          var kmTanqueTxt = (c.temDados && c.kmTanque > 0) ? App.fmtNum(Math.round(c.kmTanque)) + ' km/tanque' : '';
          var selo = (c.temDados && c.kmL === melhorKmL) ? '<span class="ms" style="color:#22c55e;font-size:16px;vertical-align:middle">military_tech</span> ' : '';
          return '<div style="' + destaque + ';border-radius:12px;padding:12px 14px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
              '<b>' + selo + App.esc(v.nome) + '</b>' +
              '<small style="color:var(--txt2)">' + App.esc(v.combustivel || '') + '</small>' +
            '</div>' +
            '<div style="margin-top:6px;font-size:14px">' +
              (c.temDados
                ? '<b>' + kmLTxt + '</b>' + (kmTanqueTxt ? ' · ' + kmTanqueTxt : '')
                : '<span style="color:var(--txt2)">' + kmLTxt + '</span>') +
            '</div>' +
            (c.temDados ? '<small style="color:var(--txt2)">baseado em ' + c.trechos + ' trecho(s) com tanque cheio</small>' : '') +
          '</div>';
        }).join('') +
      '</div>' +
      '<p style="margin-top:14px;font-size:12px;color:var(--txt2);line-height:1.5">' +
        '<span class="ms" style="font-size:14px;vertical-align:middle">info</span> ' +
        'O cálculo usa apenas os trechos entre abastecimentos marcados como "tanque cheio", ' +
        'que é o único jeito confiável de medir o consumo real.' +
      '</p>';

      App.abrirModal('Consumo dos veículos', html, null);
    }).catch(function (e) {
      console.error('CarWay hub consumo:', e);
      App.abrirModal('Consumo dos veículos', '<p style="text-align:center;color:var(--txt2)">Erro ao carregar dados.</p>', null);
    });
  },

  /* =========================================================
     ALERTAS DE REVISÃO
     Mesmo algoritmo de status (vencido/atenção/ok) já usado em
     Manutencoes.calcularStatus, só que independente — busca os
     próprios dados via Supabase, para funcionar mesmo que o
     usuário nunca tenha aberto a aba "Manutenção".
     ========================================================= */

  /** KM atual do veículo: maior valor entre kmInicial, abastecimentos, viagens e manutenções. */
  _kmAtualVeiculoAlertas: function (veiculoId, ctx) {
    var km = 0;
    var veic = ctx.veiculosById[veiculoId];
    if (veic) km = Math.max(km, Number(veic.kmInicial) || 0);
    ctx.abastecimentos.forEach(function (a) { if (a.veiculoId === veiculoId) km = Math.max(km, Number(a.km) || 0); });
    ctx.viagens.forEach(function (v) { if (v.veiculoId === veiculoId) km = Math.max(km, Number(v.kmFinal) || 0); });
    ctx.manutencoes.forEach(function (m) { if (m.veiculoId === veiculoId) km = Math.max(km, Number(m.km) || 0); });
    return km;
  },

  /**
   * Calcula o status de um plano de manutenção (vencido/atencao/ok).
   * Suporta intervalo em KM, MESES ou DIAS. O limite de "atencao" por
   * data e PROPORCIONAL ao tamanho do intervalo (10% do prazo, minimo
   * 2 dias, teto 30 dias), evitando que itens de intervalo curto (ex.:
   * 1 mes) fiquem permanentemente em "atencao".
   */
  calcularStatusPlanoAlertas: function (plano, ctx) {
    var veiculo = ctx.veiculosById[plano.veiculoId];
    if (!veiculo) return null;

    var kmAtual = App._kmAtualVeiculoAlertas(plano.veiculoId, ctx);

    var ligadas = ctx.manutencoes.filter(function (m) {
      return m.veiculoId === plano.veiculoId && m.planoId && m.planoId === plano.id;
    }).sort(function (a, b) { return (Number(b.km) || 0) - (Number(a.km) || 0); });

    var ultimoKm = Number(plano.ultimoKm) || 0;
    var ultimaData = plano.ultimaData || '';
    ligadas.forEach(function (m) {
      if ((Number(m.km) || 0) > ultimoKm) ultimoKm = Number(m.km);
      if (String(m.data) > ultimaData) ultimaData = m.data;
    });

    var intervaloKm = Number(plano.intervaloKm) || 0;
    var intervaloMeses = Number(plano.intervaloMeses) || 0;
    var intervaloDias = Number(plano.intervaloDias) || 0;

    var proximoKm = 0, kmRestante = 0, progressoKm = 0;
    var proximaData = '', diasRestantes = 0, progressoData = 0, totalDiasIntervalo = 0;

    if (intervaloKm > 0) {
      proximoKm = ultimoKm + intervaloKm;
      kmRestante = proximoKm - kmAtual;
      progressoKm = Math.round(((kmAtual - ultimoKm) / intervaloKm) * 100);
    }

    if (ultimaData) {
      var d = new Date(ultimaData + 'T12:00:00');
      if (!isNaN(d.getTime())) {
        var prox = new Date(d.getTime());
        if (intervaloDias > 0) {
          /* Intervalo fino em dias: ideal para itens muito frequentes
             (semanal, quinzenal etc.) — nao aproxima para meses. */
          prox.setDate(prox.getDate() + intervaloDias);
          totalDiasIntervalo = intervaloDias;
        } else if (intervaloMeses > 0) {
          prox.setMonth(prox.getMonth() + intervaloMeses);
          totalDiasIntervalo = Math.ceil((prox - d) / 86400000) || 1;
        }
        if (totalDiasIntervalo > 0) {
          proximaData = prox.toISOString().substring(0, 10);
          var hoje = new Date();
          diasRestantes = Math.ceil((prox - hoje) / 86400000);
          progressoData = Math.round(((totalDiasIntervalo - diasRestantes) / totalDiasIntervalo) * 100);
        }
      }
    }

    var progresso = Math.max(progressoKm, progressoData);
    var status = 'ok';
    var motivos = [];
    if (intervaloKm > 0 && kmRestante <= 0) {
      status = 'vencido';
      motivos.push('KM excedido em ' + Math.abs(kmRestante) + ' km');
    } else if (intervaloKm > 0 && kmRestante <= intervaloKm * 0.15) {
      status = 'atencao';
      motivos.push('Faltam ' + kmRestante + ' km');
    }
    if (totalDiasIntervalo > 0 && proximaData) {
      /* Limite de "atencao" proporcional ao intervalo: 10% do prazo,
         no minimo 2 dias, no maximo 30 dias. Corrige o bug em que
         itens de intervalo curto (ex.: 1 mes) ficavam SEMPRE em
         atencao, ja que a janela fixa de 30 dias era do tamanho do
         proprio intervalo. */
      var limiteAtencaoDias = Math.min(30, Math.max(2, Math.round(totalDiasIntervalo * 0.10)));
      if (diasRestantes <= 0) {
        status = 'vencido';
        motivos.push('Vencido há ' + Math.abs(diasRestantes) + ' dias');
      } else if (diasRestantes <= limiteAtencaoDias) {
        if (status !== 'vencido') status = 'atencao';
        motivos.push('Faltam ' + diasRestantes + ' dias');
      }
    }
    if (!motivos.length) motivos.push('Em dia');

    return {
      plano: plano,
      veiculo: veiculo,
      kmAtual: kmAtual,
      proximoKm: proximoKm,
      proximaData: proximaData,
      progresso: Math.min(100, Math.max(0, progresso)),
      status: status,
      motivo: motivos.join(' · ')
    };
  },

  /**
   * Busca (uma vez por sessão/visita) todos os planos ativos da
   * organização e calcula o status de cada um. Resultado cacheado em
   * App._alertasCache — reaproveitado tanto pelo sininho quanto pelo
   * hub "Alertas de revisão" do Painel, sem repetir a consulta.
   */
  carregarAlertas: function () {
    if (App._alertasCache) return Promise.resolve(App._alertasCache);
    return Promise.all([
      sb.from('veiculos').select('id, nome, placa, kmInicial').eq('organizacaoId', orgAtual.id),
      sb.from('planos').select('*').eq('organizacaoId', orgAtual.id),
      sb.from('manutencoes').select('veiculoId, km, data, planoId').eq('organizacaoId', orgAtual.id),
      sb.from('abastecimentos').select('veiculoId, km').eq('organizacaoId', orgAtual.id),
      sb.from('viagens').select('veiculoId, kmFinal').eq('organizacaoId', orgAtual.id)
    ]).then(function (r) {
      var veiculos = r[0].data || [];
      var planos = r[1].data || [];
      var manutencoes = r[2].data || [];
      var abastecimentos = r[3].data || [];
      var viagens = r[4].data || [];

      var veiculosById = {};
      veiculos.forEach(function (v) { veiculosById[v.id] = v; });

      var ctx = { veiculosById: veiculosById, manutencoes: manutencoes, abastecimentos: abastecimentos, viagens: viagens };

      var itens = planos
        .filter(function (p) { return String(p.ativo || 'SIM').toUpperCase() !== 'NAO'; })
        .map(function (p) { return App.calcularStatusPlanoAlertas(p, ctx); })
        .filter(Boolean);

      var ordem = { vencido: 0, atencao: 1, ok: 2 };
      itens.sort(function (a, b) { return ordem[a.status] - ordem[b.status] || b.progresso - a.progresso; });

      App._alertasCache = itens;
      return itens;
    });
  },

  /** Atualiza a badge do sininho no topo com a contagem de vencidos+atenção. */
  atualizarSininho: function (itens) {
    var badge = document.getElementById('sininhoBadge');
    if (!badge) return;
    var criticos = (itens || []).filter(function (x) { return x.status === 'vencido' || x.status === 'atencao'; }).length;
    if (criticos > 0) {
      badge.textContent = criticos > 9 ? '9+' : String(criticos);
      badge.classList.remove('oculto');
    } else {
      badge.classList.add('oculto');
    }
  },

  /**
   * Modal com a lista de alertas de revisão (vencidos e próximos) de
   * todos os veículos da organização. Reaproveita App._alertasCache
   * quando já carregado (ex.: ao abrir pelo Painel logo após o login).
   */
  abrirHubAlertas: function () {
    App.abrirModal('Alertas de revisão',
      '<div style="text-align:center;padding:20px 0">' +
        '<span class="ms" style="font-size:40px;opacity:.5">hourglass_top</span>' +
        '<p style="margin-top:10px;color:var(--txt2)">Carregando...</p>' +
      '</div>', null);

    App.carregarAlertas().then(function (itens) {
      App.atualizarSininho(itens);

      var criticos = itens.filter(function (x) { return x.status !== 'ok'; });

      if (!itens.length) {
        App.abrirModal('Alertas de revisão',
          '<div style="text-align:center;padding:20px 0;color:var(--txt2)">' +
            '<span class="ms" style="font-size:48px;opacity:.5">event_repeat</span>' +
            '<p style="margin-top:12px">Nenhum plano de manutenção cadastrado ainda.</p>' +
          '</div>', null);
        return;
      }

      if (!criticos.length) {
        App.abrirModal('Alertas de revisão',
          '<div style="text-align:center;padding:20px 0;color:#86efac">' +
            '<span class="ms" style="font-size:48px">check_circle</span>' +
            '<p style="margin-top:12px;color:var(--txt2)">Tudo em dia! Nenhuma revisão vencida ou próxima.</p>' +
          '</div>', null);
        return;
      }

      var html = '<div style="display:flex;flex-direction:column;gap:12px">' +
        criticos.map(function (item) {
          var p = item.plano, v = item.veiculo;
          var cor = item.status === 'vencido' ? '#ef4444' : '#f59e0b';
          var ico = item.status === 'vencido' ? 'error' : 'schedule';
          var label = item.status === 'vencido' ? 'Vencido' : 'Atenção';
          return '<div style="border:1px solid ' + cor + '55;background:' + cor + '14;border-radius:12px;padding:12px 14px">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
              '<div style="min-width:0">' +
                '<b style="display:flex;align-items:center;gap:6px"><span class="ms" style="color:' + cor + ';font-size:18px">' + ico + '</span>' + App.esc(p.item) + '</b>' +
                '<small style="display:block;color:var(--txt2);margin-top:3px">' + App.esc(v.nome) + (v.placa ? ' · ' + App.esc(v.placa) : '') + '</small>' +
              '</div>' +
              '<span style="flex:none;font-size:10.5px;font-weight:700;color:' + cor + ';background:' + cor + '22;padding:3px 9px;border-radius:99px">' + label + '</span>' +
            '</div>' +
            '<div style="margin-top:8px;font-size:12.5px;color:' + cor + ';font-weight:600">' + App.esc(item.motivo) + '</div>' +
            '<button style="margin-top:10px;width:100%;background:linear-gradient(135deg,var(--azul),#6366f1);color:#fff;border:0;border-radius:9px;padding:10px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px" ' +
              'onclick="App.fecharModal();App.irParaFormManutencao(null,\'' + p.id + '\')">' +
              '<span class="ms" style="font-size:16px">build</span> Lançar serviço' +
            '</button>' +
          '</div>';
        }).join('') +
      '</div>';

      App.abrirModal('Alertas de revisão (' + criticos.length + ')', html, null);
    }).catch(function (e) {
      console.error('CarWay alertas:', e);
      App.abrirModal('Alertas de revisão', '<p style="text-align:center;color:var(--txt2)">Erro ao carregar dados.</p>', null);
    });
  },

  /**
   * Calcula o status (vencido/atencao/ok) de um documento a partir da
   * data de vencimento. Usado tanto pelo resumo do hub do Painel quanto
   * pela página Documentos (documentos.js).
   */
  statusDocumento: function (dataVencimento) {
    if (!dataVencimento) return { status: 'ok', dias: null, motivo: 'Sem vencimento definido' };
    var hoje = new Date();
    var venc = new Date(dataVencimento + 'T12:00:00');
    if (isNaN(venc.getTime())) return { status: 'ok', dias: null, motivo: '' };
    var dias = Math.ceil((venc - hoje) / 86400000);
    if (dias <= 0) return { status: 'vencido', dias: dias, motivo: 'Vencido há ' + Math.abs(dias) + ' dia(s)' };
    if (dias <= 30) return { status: 'atencao', dias: dias, motivo: 'Vence em ' + dias + ' dia(s)' };
    return { status: 'ok', dias: dias, motivo: 'Vence em ' + dias + ' dia(s)' };
  },

  /**
   * Busca só o essencial (id + dataVencimento) para calcular o
   * subtítulo/cor do hub "Documentos" no Painel, sem duplicar a
   * consulta completa que a página Documentos já faz sozinha.
   */
  carregarDocumentosResumo: function () {
    return sb.from('documentos').select('id, dataVencimento').eq('organizacaoId', orgAtual.id).then(function (r) {
      var documentos = (r.data || []).map(function (d) {
        var st = App.statusDocumento(d.dataVencimento);
        return { id: d.id, _status: st.status };
      });
      App._documentosCache = { documentos: documentos };
      return App._documentosCache;
    }).catch(function (e) {
      console.error('CarWay documentos (resumo):', e);
      App._documentosCache = { documentos: [] };
      return App._documentosCache;
    });
  },

  /**
   * Busca só a contagem de membros ativos + convites pendentes, para
   * o subtítulo/cor do hub "Equipe" no Painel, sem duplicar a consulta
   * completa que a página Equipe faz sozinha.
   */
  carregarEquipeResumo: function () {
    return Promise.all([
      sb.from('membros_organizacao').select('id', { count: 'exact', head: true }).eq('organizacaoId', orgAtual.id).eq('status', 'ATIVO'),
      sb.from('convites').select('id', { count: 'exact', head: true }).eq('organizacaoId', orgAtual.id).eq('status', 'PENDENTE')
    ]).then(function (r) {
      App._equipeResumo = { membros: r[0].count || 0, pendentes: r[1].count || 0 };
      return App._equipeResumo;
    }).catch(function (e) {
      console.error('CarWay equipe (resumo):', e);
      App._equipeResumo = { membros: 0, pendentes: 0 };
      return App._equipeResumo;
    });
  },

  lancar: function (tipo) {
    if (tipo === 'abastecimento') { App.irParaFormAbastecimento(); return; }
    if (tipo === 'despesa') { App.irParaFormDespesa(); return; }
    if (tipo === 'manutencao') { App.irParaFormManutencao(); return; }
    if (tipo === 'viagem') { App.irParaFormViagem(); return; }
  },
  /* ============ MENU ============ */
  renderMenu: function () {
    var grid = document.getElementById('menuGrid');
    if (!grid) return;
    var cards = [
      { acao: 'painel', icone: 'dashboard', titulo: 'Painel', sub: 'Resumo dos gastos', cor: 'azul' },
      { acao: 'veiculos', icone: 'directions_car', titulo: 'Veículos', sub: 'toque para cadastrar', cor: 'verde' },
      { acao: 'viagens', icone: 'luggage', titulo: 'Viagens', sub: 'planejar, registrar, postos', cor: 'roxo' },
      { acao: 'abastecimentos', icone: 'local_gas_station', titulo: 'Abastecimento', sub: 'toque para lançar', cor: 'ciano' },
      { acao: 'manutencao', icone: 'build', titulo: 'Manutenção', sub: 'toque para lançar', cor: 'amarelo' },
      { acao: 'despesas', icone: 'receipt_long', titulo: 'Despesas', sub: 'toque para lançar', cor: 'vermelho' },
      { acao: 'configuracoes', icone: 'admin_panel_settings', titulo: 'Configurações', sub: 'sua conta', cor: 'cinza', full: true }
    ];
    grid.innerHTML = cards.map(function (c) {
      return '<button class="menu-card ' + c.cor + (c.full ? ' menu-card-full' : '') + '" ' +
        'onclick="App.acionarMenu(\'' + c.acao + '\')">' +
        '<span class="ms">' + c.icone + '</span>' +
        '<b>' + c.titulo + '</b>' +
        '<small>' + c.sub + '</small>' +
      '</button>';
    }).join('');
  },
  acionarMenu: function (acao) {
    if (acao === 'painel') { App.irPara('painel'); return; }
    if (acao === 'veiculos') { App.irParaFormVeiculo(); return; }
    if (acao === 'viagens') { App.irParaFormViagem(); return; }
    if (acao === 'configuracoes') { App.irPara('configuracoes'); return; }
    if (acao === 'abastecimentos') { App.irParaFormAbastecimento(); return; }
    if (acao === 'manutencao') { App.irParaFormManutencao(); return; }
    if (acao === 'despesas') { App.irParaFormDespesa(); return; }
  },
  pedeVeiculo: function (destino) {
    sb.from('veiculos').select('id', { count: 'exact', head: true }).eq('organizacaoId', orgAtual.id).then(function (r) {
      var total = r.count || 0;
      if (total === 0) {
        App.abrirModal('Veículo necessário',
          '<div style="text-align:center;padding:10px 0">' +
            '<span class="ms" style="font-size:56px;color:var(--txt2);opacity:0.5">directions_car</span>' +
            '<h3 style="margin:16px 0 10px">Cadastre um veículo primeiro</h3>' +
            '<p style="color:var(--txt2);font-size:14px;line-height:1.6;margin:0 0 20px">' +
              'Para lançar, você precisa cadastrar pelo menos um veículo.' +
            '</p>' +
          '</div>',
          function () { App.fecharModal(); App.irParaFormVeiculo(); },
          'Cadastrar veículo'
        );
        return;
      }
            if (destino === 'abastecimentos') {
        App.acionarMenu('abastecimentos');
      } else {
        App.irPara(destino);
      }
    });
  },
  /* ============ CONFIGURACOES ============ */
  /** Verifica se o usuário logado é o master (super-admin do CarWay). */
  souMaster: function () {
    return !!(usuarioAtual && usuarioAtual.isMaster);
  },
  renderConfiguracoes: function () {
    var el = document.getElementById('configLista');
    if (!el) return;
    /* Tela IDÊNTICA para todo mundo, inclusive o master — a única
       diferença é o card extra "Painel Administrativo", que só
       aparece se App.souMaster() for verdadeiro. */
    var navAtual = usuarioAtual.appNavegacaoPreferido === 'waze' ? 'Waze' : 'Google Maps';
    var cardMaster = App.souMaster()
      ? '<div class="config-secao">Administração</div>' +
        '<button class="config-item" onclick="App.irPara(\'painel-admin\')">' +
          '<span class="ms" style="color:#a78bfa">admin_panel_settings</span><div><b>Painel Administrativo</b><small>Usuários, planos e solicitações</small></div>' +
        '</button>'
      : '';
    el.innerHTML =
      '<div class="config-secao">Minha conta</div>' +
      '<button class="config-item" onclick="App.irParaFormPerfil()">' +
        '<span class="ms" style="color:#3b82f6">person</span><div><b>Meu perfil</b><small>' + App.esc(usuarioAtual.nome) + '</small></div>' +
      '</button>' +
      '<button class="config-item" onclick="App.irParaDetalhePlano()">' +
        '<span class="ms" style="color:#a78bfa">workspace_premium</span><div><b>Meu plano</b><small>' + App.nomePlano(orgAtual.tipoPlano) + '</small></div>' +
      '</button>' +
      '<div class="config-secao">Preferências</div>' +
      '<button class="config-item" onclick="App.alternarTema()">' +
        '<span class="ms" style="color:#f59e0b">dark_mode</span><div><b>Tema</b><small>Claro ou escuro</small></div>' +
      '</button>' +
      '<button class="config-item" onclick="App.abrirEscolhaNavegacao()">' +
        '<span class="ms" style="color:#22c55e">near_me</span><div><b>App de navegação</b><small>' + navAtual + '</small></div>' +
      '</button>' +
      cardMaster +
      '<div class="config-secao">Conta</div>' +
      '<button class="config-item perigo" onclick="App.sair()">' +
        '<span class="ms" style="color:#ef4444">logout</span><div><b>Sair da conta</b><small>Encerrar sessão</small></div>' +
      '</button>';
  },
  /** Modal simples para escolher Waze ou Google Maps (persistido em usuarios). */
  abrirEscolhaNavegacao: function () {
    var atual = usuarioAtual.appNavegacaoPreferido || 'google_maps';
    var html = '<div style="display:flex;flex-direction:column;gap:10px">' +
      ['google_maps', 'waze'].map(function (v) {
        var nome = v === 'waze' ? 'Waze' : 'Google Maps';
        var ico = v === 'waze' ? 'near_me' : 'map';
        var sel = v === atual;
        return '<button onclick="App.salvarNavegacaoPreferida(\'' + v + '\')" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:11px;' +
          'border:1px solid ' + (sel ? 'var(--azul,#3b82f6)' : 'var(--linha,#26365c)') + ';background:' + (sel ? 'rgba(59,130,246,.12)' : 'var(--bg2,#111c33)') + ';' +
          'color:var(--txt,#e8eefc);cursor:pointer;font-family:inherit;font-size:14px;text-align:left">' +
          '<span class="ms" style="color:var(--azul2,#60a5fa)">' + ico + '</span>' +
          '<b style="flex:1">' + nome + '</b>' +
          (sel ? '<span class="ms" style="color:#22c55e">check_circle</span>' : '') +
        '</button>';
      }).join('') +
    '</div>';
    App.abrirModal('App de navegação preferido', html, null);
  },
  salvarNavegacaoPreferida: function (valor) {
    sb.from('usuarios').update({ appNavegacaoPreferido: valor }).eq('id', usuarioAtual.id).then(function (r) {
      if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
      usuarioAtual.appNavegacaoPreferido = valor;
      App.fecharModal();
      App.toast('Preferência salva!', 'ok');
      App.renderConfiguracoes();
    });
  },
  /* ============ TELAS DE ENTRADA ============ */
  mostrarTela: function (nome) {
    var telas = document.querySelectorAll('.tela');
    for (var i = 0; i < telas.length; i++) telas[i].classList.remove('ativa');
    var id = 'tela' + nome.charAt(0).toUpperCase() + nome.slice(1);
    var el = document.getElementById(id);
    if (el) el.classList.add('ativa');
    if (nome === 'login' || nome === 'cadastro') {
      document.getElementById('topbar').classList.add('oculto');
      var bvg = document.getElementById('barraVeiculoGlobal');
      if (bvg) bvg.classList.add('oculto');
      document.getElementById('conteudo').classList.add('oculto');
      document.getElementById('tabbar').classList.add('oculto');
    }
  },
  irParaCadastro: function () {
    document.getElementById('cadNome').value = '';
    document.getElementById('cadEmail').value = '';
    document.getElementById('cadSenha').value = '';
    var tel = document.getElementById('cadTelefone');
    if (tel) tel.value = '';
    if (itiCadastro) itiCadastro.setCountry('br');
    document.getElementById('msgCadastro').textContent = '';
    document.getElementById('msgCadastro').className = 'mensagem';
    App.mostrarTela('cadastro');
    setTimeout(function () { document.getElementById('cadNome').focus(); }, 100);
  },
  irParaLogin: function () {
    document.getElementById('email').value = '';
    document.getElementById('senha').value = '';
    document.getElementById('msgLogin').textContent = '';
    document.getElementById('msgLogin').className = 'mensagem';
    App.mostrarTela('login');
  },
    esqueciSenha: function () {
    var emailAtual = document.getElementById('email').value.trim();
    var html =
      '<div class="campo-form">' +
        '<label>E-mail da conta</label>' +
        '<input type="email" id="recoverEmail" placeholder="seu@email.com" value="' + App.esc(emailAtual) + '">' +
        '<small style="display:block;margin-top:8px;font-size:12px;color:var(--txt2);line-height:1.5">' +
          'Enviaremos um link para você criar uma senha nova. ' +
          'Confira também a caixa de spam.' +
        '</small>' +
      '</div>';
    App.abrirModal('Recuperar senha', html, function () {
      var email = document.getElementById('recoverEmail').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        App.toast('E-mail inválido', 'erro');
        return;
      }
      App.fecharModal();
      App.toast('Enviando...', 'ok');
      sb.auth.resetPasswordForEmail(email).then(function (r) {
        if (r.error) {
          App.toast('Erro: ' + r.error.message, 'erro');
          return;
        }
        App.toast('Link enviado! Confira seu e-mail.', 'ok');
      }).catch(function (e) {
        App.toast('Erro: ' + (e.message || ''), 'erro');
      });
    }, 'Enviar link');
  },
  fazerLogin: function (event) {
    event.preventDefault();
    var email = document.getElementById('email').value.trim();
    var senha = document.getElementById('senha').value;
    var btn = document.getElementById('btnEntrar');
    var msg = document.getElementById('msgLogin');
    if (!email || !senha) {
      msg.textContent = 'Preencha email e senha';
      msg.className = 'mensagem erro';
      return;
    }
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Entrando...';
    msg.textContent = '';
    msg.className = 'mensagem';
    sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
      if (r.error) {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Entrar';
        msg.textContent = App.traduzErro(r.error.message);
        msg.className = 'mensagem erro';
      }
    }).catch(function (e) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Entrar';
      msg.textContent = 'Erro: ' + (e.message || '');
      msg.className = 'mensagem erro';
    });
  },
  fazerCadastro: function (event) {
    event.preventDefault();
    var nome = document.getElementById('cadNome').value.trim();
    var email = document.getElementById('cadEmail').value.trim().toLowerCase();
    var senha = document.getElementById('cadSenha').value;
    var telInput = document.getElementById('cadTelefone');
    var btn = document.getElementById('btnCadastrar');
    var msg = document.getElementById('msgCadastro');
    if (!nome || nome.length < 2) { msg.textContent = 'Informe seu nome'; msg.className = 'mensagem erro'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = 'E-mail inválido'; msg.className = 'mensagem erro'; return; }
    if (!itiCadastro || !itiCadastro.isValidNumber()) { msg.textContent = 'Telefone inválido'; msg.className = 'mensagem erro'; return; }
    if (senha.length < 6) { msg.textContent = 'Senha muito curta'; msg.className = 'mensagem erro'; return; }
    var telData = itiCadastro.getSelectedCountryData();
    var telDdi = '+' + (telData.dialCode || '55');
    var telNumeros = telInput.value.replace(/\D/g, '');
    if (telData.iso2 === 'br' && telNumeros.length > 11) telNumeros = telNumeros.slice(-11);
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Criando conta...';
    msg.textContent = '';
    msg.className = 'mensagem';
    sb.auth.signUp({ email: email, password: senha }).then(function (r) {
      if (r.error) {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Criar conta';
        msg.textContent = App.traduzErroCadastro(r.error.message);
        msg.className = 'mensagem erro';
        return;
      }
      if (!r.data || !r.data.user) {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Criar conta';
        msg.textContent = 'Erro ao criar conta';
        msg.className = 'mensagem erro';
        return;
      }
      if (!r.data.session) {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Criar conta';
        msg.textContent = 'Confirme seu e-mail para entrar';
        msg.className = 'mensagem ok';
        setTimeout(App.irParaLogin, 3000);
        return;
      }
      return sb.rpc('criar_conta_completa', {
        p_nome: nome, p_email: email,
        p_telefone: telNumeros, p_telefone_pais: telDdi
      }).then(function (r2) {
        if (r2.error) {
          btn.disabled = false;
          btn.querySelector('span').textContent = 'Criar conta';
          msg.textContent = 'Erro: ' + r2.error.message;
          msg.className = 'mensagem erro';
          return;
        }
        setTimeout(function () { App.carregarPerfil(r.data.user); }, 300);
      });
    }).catch(function (e) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Criar conta';
      msg.textContent = 'Erro: ' + (e.message || '');
      msg.className = 'mensagem erro';
    });
  },
  /* ============ TEMA / UTIL ============ */
  aplicarTemaSalvo: function () {
    var tema = 'escuro';
    try { tema = localStorage.getItem('carway_tema') || 'escuro'; } catch (e) {}
    document.body.classList.toggle('tema-claro', tema === 'claro');
    var btn = document.getElementById('temaIcone');
    if (btn) btn.textContent = (tema === 'claro') ? 'dark_mode' : 'light_mode';
  },
  alternarTema: function () {
    var claro = document.body.classList.contains('tema-claro');
    var novo = claro ? 'escuro' : 'claro';
    document.body.classList.toggle('tema-claro', novo === 'claro');
    try { localStorage.setItem('carway_tema', novo); } catch (e) {}
    var btn = document.getElementById('temaIcone');
    if (btn) btn.textContent = (novo === 'claro') ? 'dark_mode' : 'light_mode';
    App.toast(novo === 'claro' ? 'Modo claro' : 'Modo escuro', 'ok');
  },
  sair: function () {
    App.confirmar({
      titulo: 'Sair da conta',
      mensagem: 'Você será desconectado deste aparelho. Sua sessão será encerrada, ' +
        'mas seus dados continuam salvos com segurança.',
      textoBotao: 'Sair da conta',
      tipo: 'aviso',
      icone: 'logout',
      aoConfirmar: function () {
        sb.auth.signOut().then(function () {
          usuarioAtual = null;
          orgAtual = null;
          App.mostrarTela('login');
        });
      }
    });
  },
  recarregar: function () { App.toast('Atualizando...', 'ok'); location.reload(); },
  abrirAlertas: function () { App.abrirHubAlertas(); },
  toast: function (msg, tipo) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'on ' + (tipo || '');
    clearTimeout(App._tt);
    App._tt = setTimeout(function () { t.className = ''; }, 3000);
  },
  esc: function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  mostrarErroLogin: function (txt) {
    var msg = document.getElementById('msgLogin');
    if (msg) { msg.textContent = txt; msg.className = 'mensagem erro'; }
    var btn = document.getElementById('btnEntrar');
    if (btn) { btn.disabled = false; btn.querySelector('span').textContent = 'Entrar'; }
    App.mostrarTela('login');
  },
  traduzErro: function (t) {
    t = String(t || '').toLowerCase();
    if (t.indexOf('invalid login') > -1) return 'E-mail ou senha incorretos';
    if (t.indexOf('invalid credentials') > -1) return 'E-mail ou senha incorretos';
    if (t.indexOf('rate limit') > -1) return 'Muitas tentativas';
    return 'Erro: ' + t;
  },
  traduzErroCadastro: function (t) {
    t = String(t || '').toLowerCase();
    if (t.indexOf('already registered') > -1) return 'E-mail já cadastrado';
    if (t.indexOf('invalid email') > -1) return 'E-mail inválido';
    if (t.indexOf('signups are disabled') > -1) return 'Cadastro desativado';
    return 'Erro: ' + t;
  },
  nomePlano: function (c) {
    var m = { FREE: 'Free', FAMILIAR: 'Familiar', FAMILIAR_PREMIUM: 'Familiar Premium', FROTA: 'Frota', FROTA_PREMIUM: 'Frota Premium' };
    return m[c] || c;
  },
   _contadorUid: 0,
  uid: function () {
    App._contadorUid = (App._contadorUid || 0) + 1;
    var ts = Date.now().toString(36);
    var rand = Math.random().toString(36).substring(2, 10);
    var cont = App._contadorUid.toString(36);
    return ts + rand + cont;
  },
  fmtNum: function (n) { return (Number(n) || 0).toLocaleString('pt-BR'); },
  abrirModal: function (titulo, html, onConfirmar, textoBotao) {
    document.getElementById('modalTitulo').textContent = titulo;
    document.getElementById('modalCorpo').innerHTML = html;
    var rodape = document.getElementById('modalRodape');
    if (onConfirmar) {
      rodape.style.display = 'flex';
      var btn = document.getElementById('btnModalSalvar');
      btn.textContent = textoBotao || 'Confirmar';
      btn.onclick = onConfirmar;
    } else rodape.style.display = 'none';
    document.getElementById('modal').classList.add('aberto');
  },
  fecharModal: function () {
    document.getElementById('modal').classList.remove('aberto');
  },
  confirmar: function (opcoes) {
    opcoes = opcoes || {};
    var titulo = opcoes.titulo || 'Confirmar';
    var mensagem = opcoes.mensagem || 'Tem certeza que deseja continuar?';
    var textoBotao = opcoes.textoBotao || 'Excluir';
    var tipo = opcoes.tipo || 'perigo';
    var icone = opcoes.icone || 'warning';
    var aoConfirmar = opcoes.aoConfirmar;
    var corBorda = tipo === 'perigo' ? '#ef4444' : '#f59e0b';
    var corFundo = tipo === 'perigo' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)';
    var corTexto = tipo === 'perigo' ? '#fca5a5' : '#fcd34d';
    var corBotao = tipo === 'perigo'
      ? 'linear-gradient(135deg, #dc2626, #ef4444)'
      : 'linear-gradient(135deg, #d97706, #f59e0b)';
    var html =
      '<div style="display:flex;gap:14px;align-items:flex-start">' +
        '<div style="width:52px;height:52px;border-radius:14px;' +
          'background:' + corFundo + ';color:' + corBorda + ';' +
          'display:grid;place-items:center;flex:none">' +
          '<span class="ms" style="font-size:28px">' + icone + '</span>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--txt)">' +
            'Tem certeza?' +
          '</div>' +
          '<div style="font-size:14px;line-height:1.6;color:var(--txt2)">' +
            mensagem +
          '</div>' +
          '<div style="margin-top:14px;padding:10px 12px;' +
            'background:rgba(239,68,68,.08);border-left:3px solid ' + corBorda + ';' +
            'border-radius:6px;font-size:12.5px;color:' + corTexto + '">' +
            '<b>Esta ação não pode ser desfeita.</b>' +
          '</div>' +
        '</div>' +
      '</div>';
    var modalAntigo = document.getElementById('modalCorpo').innerHTML;
    App.abrirModal(titulo, html, function () {
      App.fecharModal();
      if (typeof aoConfirmar === 'function') aoConfirmar();
    }, textoBotao);
    var btn = document.getElementById('btnModalSalvar');
    if (btn) {
      btn.style.background = corBotao;
      btn.style.color = '#fff';
      btn.style.fontWeight = '700';
      btn.textContent = textoBotao;
    }
  },
  /* ============ NOVAS FUNCOES UTILITARIAS ============ */
  hojeISO: function () {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  },
  moedaCurta: function (n) {
    n = Number(n) || 0;
    if (n >= 1000) return 'R$ ' + (n / 1000).toFixed(1).replace('.', ',') + 'k';
    return 'R$ ' + n.toFixed(0);
  },
  moeda: function (n) {
    return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  /* ============================================================
     VEICULO ATIVO — SELETOR GLOBAL/UNIVERSAL (todas as paginas)
     ============================================================ */
  veiculoAtivoId: null,
  _veiculosGlobalCache: null,
  _ouvintesVeiculoAtivo: [],

  _chaveVeiculoAtivo: function () {
    return 'carway_veiculo_ativo_' + ((typeof orgAtual !== 'undefined' && orgAtual && orgAtual.id) || 'geral');
  },

  _carregarVeiculoAtivoSalvo: function () {
    try {
      App.veiculoAtivoId = localStorage.getItem(App._chaveVeiculoAtivo()) || null;
    } catch (e) { App.veiculoAtivoId = null; }
  },

  _salvarVeiculoAtivo: function () {
    try {
      if (App.veiculoAtivoId) localStorage.setItem(App._chaveVeiculoAtivo(), App.veiculoAtivoId);
      else localStorage.removeItem(App._chaveVeiculoAtivo());
    } catch (e) {}
  },

  /** Qualquer pagina pode chamar App.aoTrocarVeiculoAtivo(function (id) {...})
      para ser avisada sempre que o usuario trocar o veiculo ativo na
      barra global, de qualquer lugar do app. */
  aoTrocarVeiculoAtivo: function (fn) {
    if (typeof fn === 'function') App._ouvintesVeiculoAtivo.push(fn);
  },

  definirVeiculoAtivo: function (veiculoId) {
    App.veiculoAtivoId = veiculoId || null;
    App._salvarVeiculoAtivo();
    App._renderConteudoBarraVeiculoGlobal();
    App._ouvintesVeiculoAtivo.forEach(function (fn) {
      try { fn(App.veiculoAtivoId); } catch (e) { console.error('CarWay veiculo ativo:', e); }
    });
  },

  _iconeTipoVeiculo: function (tipo) {
    var m = {
      carro: 'directions_car', suv: 'directions_car', moto: 'two_wheeler',
      caminhao: 'local_shipping', onibus: 'directions_bus', van: 'airport_shuttle'
    };
    return m[tipo] || 'directions_car';
  },

  /* Mesma tabela de CORES_VEICULO definida em veiculos.js: o campo
     v.cor guarda um TOKEN ('azul', 'laranja' etc.), nao um hex direto.
     Usar o token cru como cor CSS e invalido (o navegador ignora e cai
     no cinza padrao) — por isso a conversao abaixo e obrigatoria. */
  _CORES_VEICULO_HEX: {
    azul: '#3b82f6', verde: '#22c55e', roxo: '#a78bfa', laranja: '#f59e0b',
    vermelho: '#ef4444', ciano: '#22d3ee', rosa: '#ec4899', cinza: '#94a3b8'
  },

  _corVeiculo: function (v) {
    if (v && v.cor && App._CORES_VEICULO_HEX[v.cor]) return App._CORES_VEICULO_HEX[v.cor];
    var paleta = ['#3b82f6', '#f59e0b', '#a78bfa', '#22c55e', '#22d3ee', '#ec4899', '#f97316', '#84cc16'];
    var idx = 0, id = (v && v.id) || '';
    for (var i = 0; i < id.length; i++) idx += id.charCodeAt(i);
    return paleta[idx % paleta.length];
  },

  /** Lista de veiculos usada so para montar a barra global (cache
      simples; use forcar=true para recarregar apos criar/excluir). */
  carregarVeiculosGlobais: function (forcar) {
    if (App._veiculosGlobalCache && !forcar) return Promise.resolve(App._veiculosGlobalCache);
    return sb.from('veiculos').select('id,nome,placa,tipo,cor').eq('organizacaoId', orgAtual.id).order('nome').then(function (r) {
      App._veiculosGlobalCache = r.data || [];
      return App._veiculosGlobalCache;
    });
  },

  /** Chame isto de qualquer pagina depois de criar/editar/excluir um
      veiculo, para a barra global refletir a mudanca imediatamente
      (ex.: dentro de veiculos.js, apos salvar ou excluir). */
  atualizarBarraVeiculoGlobal: function () {
    App.carregarVeiculosGlobais(true).then(function (veiculos) {
      if (App.veiculoAtivoId && !veiculos.some(function (v) { return v.id === App.veiculoAtivoId; })) {
        App.veiculoAtivoId = null;
        App._salvarVeiculoAtivo();
      }
      App._renderConteudoBarraVeiculoGlobal();
    });
  },

  /** Cria (se ainda nao existir) o container da barra logo apos a
      topbar, e desenha o conteudo. Chamado uma vez apos o login
      (dentro de entrarNoApp). */
renderBarraVeiculoGlobal: function () {
  var el = document.getElementById('barraVeiculoGlobal');

  if (!el) {
    var topbar = document.getElementById('topbar');

    if (!topbar || !topbar.parentNode) return;

    el = document.createElement('div');
    el.id = 'barraVeiculoGlobal';
    el.className = 'oculto';

    topbar.parentNode.insertBefore(
      el,
      topbar.nextSibling
    );
  }

  App._carregarVeiculoAtivoSalvo();

  App.carregarVeiculosGlobais().then(function () {
    App._renderConteudoBarraVeiculoGlobal();
  });
},

_renderConteudoBarraVeiculoGlobal: function () {
  var el = document.getElementById(
    'barraVeiculoGlobal'
  );

  if (!el) return;

  var veiculos =
    App._veiculosGlobalCache || [];

  if (veiculos.length <= 1) {
    el.classList.add('oculto');
    el.innerHTML = '';
    return;
  }

  el.classList.remove('oculto');

  el.style.cssText =
    'background:rgba(11,17,32,.97);' +
    'border-bottom:1px solid var(--linha,#26365c);' +
    'padding:8px 14px;' +
    'display:flex;' +
    'gap:8px;' +
    'overflow-x:auto;' +
    '-webkit-overflow-scrolling:touch';

  var todosSel =
    !App.veiculoAtivoId;

  var chips =
    '<button ' +
      'onclick="App.definirVeiculoAtivo(null)" ' +
      'style="' +
        App._estiloChipVeiculoGlobal(
          todosSel,
          '#60a5fa'
        ) +
      '">' +

      '<span class="ms" ' +
        'style="font-size:16px">' +
        'apps' +
      '</span>' +

      'Todos' +
    '</button>';

  chips += veiculos.map(function (v) {
    var sel =
      App.veiculoAtivoId === v.id;

    var cor =
      App._corVeiculo(v);

    return (
      '<button ' +
        'onclick="App.definirVeiculoAtivo(\'' +
          v.id +
        '\')" ' +

        'style="' +
          App._estiloChipVeiculoGlobal(
            sel,
            cor
          ) +
        '">' +

        '<span class="ms" ' +
          'style="font-size:16px;' +
          'color:' + cor + '">' +

          App._iconeTipoVeiculo(v.tipo) +

        '</span>' +

        App.esc(v.nome) +

      '</button>'
    );
  }).join('');

  el.innerHTML = chips;
},
  _estiloChipVeiculoGlobal: function (selecionado, cor) {
    return 'flex:none;display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:99px;' +
      'font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;' +
      'background:' + (selecionado ? cor + '26' : 'var(--card,#16213b)') + ';' +
      'border:1.5px solid ' + (selecionado ? cor : 'var(--linha,#26365c)') + ';' +
      'color:' + (selecionado ? cor : 'var(--txt,#e8eefc)');
  }
};
document.addEventListener('DOMContentLoaded', App.init);
