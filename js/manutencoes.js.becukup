/* APP_VERSION: v2.7 */
/* =====================================================================
   CARWAY - MANUTENCOES
   Historico de mudancas relevantes:
   v2.0 a v2.4 (ver versoes anteriores) — planoId null quando avulso,
   recalculo do plano ao excluir manutencao vinculada, sincronizacao do
   sininho, limite de atencao por data proporcional ao intervalo,
   suporte a intervalo em dias, layout compacto em grade de 4 colunas
   com cores dinamicas conforme status.

   v2.5 (esta versao)
   - NOVO: seletor de veiculos (chips "Todos" + um por veiculo, com
     icone do tipo) no topo da pagina, compartilhado pelas 3 abas
     (Monitoramento / Historico / Planos). Essencial para frotas com
     varios veiculos — sem isso, o app misturava os planos de todos os
     carros numa lista so, inviavel com muitos veiculos.
   - NOVO: quando "Todos" esta selecionado, Monitoramento e Planos
     agrupam os itens em blocos por veiculo, RECOLHIDOS por padrao.
     Clicar no cabecalho do bloco expande APENAS aquele veiculo
     (comportamento tipo "acordeon": abrir um fecha o anterior).
   - NOVO: cada card de manutencao (Monitoramento) mostra o icone do
     tipo do veiculo + nome + placa, para identificar de qual carro e
     aquele item mesmo fora do contexto do bloco.
   - NOVO: Historico tambem respeita o filtro de veiculo selecionado.
   - MELHORADO: Exportar PDF agora e organizado por veiculo (quando
     "Todos") ou traz so o veiculo selecionado, com duas tabelas por
     veiculo: "Ja realizado" (historico) e "Proximas manutencoes"
     (planos ativos, com km/dias faltantes e status).

   v2.6 (esta versao)
   - MUDANCA IMPORTANTE: o seletor de veiculos deixou de ser local desta
     pagina e passou a ser GLOBAL/UNIVERSAL (implementado em app.js,
     ver PATCH-app-seletor-global.txt). A barra de chips agora aparece
     logo abaixo da topbar em QUALQUER pagina do app, e o veiculo
     escolhido persiste ao navegar entre Manutencao, Veiculos,
     Abastecimentos, Despesas, Documentos e Viagens.
   - Este arquivo foi atualizado para LER o veiculo ativo de
     App.veiculoAtivoId (em vez de ter seu proprio estado), e se
     inscreve para ser avisado (App.aoTrocarVeiculoAtivo) sempre que o
     usuario trocar o veiculo em qualquer lugar do app, redesenhando-se
     sozinho se a pagina de Manutencao estiver aberta na hora.
   ===================================================================== */
var Manutencoes = {
  lista: [],
  planos: [],
  veiculos: [],
  abastecimentos: [],
  viagens: [],
  aba: 'monitor',
  editando: null,
  editandoPlano: null,

  /* Filtro dos cards de status no Monitoramento: null | 'vencido' | 'atencao' | 'ok' */
  _filtroMonitor: null,

  /* Filtro de periodo do Historico (mesmo padrao do filtro do Painel) */
  filtroHist: { modo: 'mes', ano: 0, mes: 0 },

  /* Cor padrao do icone de bomba de combustivel em todo o modulo */
  CORICONEABASTECIMENTO: '#ef4444',

  /* O veiculo selecionado agora e GLOBAL (App.veiculoAtivoId), definido
     pela barra universal no topo do app — nao existe mais um seletor
     proprio aqui dentro de Manutencoes. Sempre que precisar saber qual
     veiculo esta ativo, leia App.veiculoAtivoId diretamente (null = "Todos"). */
  _listenerVeiculoRegistrado: false,

  /* Bloco (veiculoId) expandido no modo "Todos", um por aba — accordion:
     abrir um fecha o anterior automaticamente. */
  _blocoAbertoMonitor: null,
  _blocoAbertoPlanos: null,

  /* Paleta de cores para diferenciar veiculos visualmente quando
     nao ha cor cadastrada no proprio veiculo. */
  _PALETA_VEICULOS: ['#3b82f6', '#f59e0b', '#a78bfa', '#22c55e', '#22d3ee', '#ec4899', '#f97316', '#84cc16'],

  /* =========================================================
     CARREGAR TUDO
     ========================================================= */
  carregarTudo: function () {
    var el = document.getElementById('conteudoManut');
    if (!el) return;
    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';

    Manutencoes.sincronizarAbaVisual();
    Manutencoes._registrarListenerVeiculoGlobal();

    Promise.all([
      sb.from('manutencoes').select('*').eq('organizacaoId', orgAtual.id).order('data', { ascending: false }),
      sb.from('planos').select('*').eq('organizacaoId', orgAtual.id),
      sb.from('veiculos').select('*').eq('organizacaoId', orgAtual.id).order('nome'),
      sb.from('abastecimentos').select('veiculoId, km, data').eq('organizacaoId', orgAtual.id),
      sb.from('viagens').select('veiculoId, kmFinal, dataFim').eq('organizacaoId', orgAtual.id)
    ]).then(function (resultados) {
      Manutencoes.lista = resultados[0].data || [];
      Manutencoes.planos = resultados[1].data || [];
      Manutencoes.veiculos = resultados[2].data || [];
      Manutencoes.abastecimentos = resultados[3].data || [];
      Manutencoes.viagens = resultados[4].data || [];

      if (Manutencoes.veiculos.length === 0) {
        el.innerHTML =
          '<div class="vazio-veiculo">' +
            '<span class="ms">directions_car</span>' +
            '<b>Nenhum veículo cadastrado</b>' +
            '<p>Cadastre um veículo para começar a controlar as revisões.</p>' +
            '<button class="btn-novo" onclick="App.irParaFormVeiculo()">' +
              '<span class="ms">add</span> Cadastrar veículo' +
            '</button>' +
          '</div>';
        return;
      }

      Manutencoes.renderAbaAtiva();
    });
  },

  setAba: function (aba) {
    Manutencoes.aba = aba;
    Manutencoes.sincronizarAbaVisual();
    Manutencoes.renderAbaAtiva();
  },

  sincronizarAbaVisual: function () {
    var abas = document.querySelectorAll('#pg-manutencao .aba-manut');
    for (var i = 0; i < abas.length; i++) {
      abas[i].classList.toggle('sel', abas[i].dataset.aba === Manutencoes.aba);
    }
  },

  renderAbaAtiva: function () {
    if (Manutencoes.aba === 'monitor') Manutencoes.renderMonitor();
    else if (Manutencoes.aba === 'historico') Manutencoes.renderHistorico();
    else if (Manutencoes.aba === 'planos') Manutencoes.renderPlanos();
  },

  /* Forca o sininho do topo (badge) e o hub "Alertas de revisao" do
     Painel a recalcularem AGORA, sem esperar o usuario visitar o
     Painel. */
  _atualizarSininhoGlobal: function () {
    if (typeof App === 'undefined' || !App.carregarAlertas) return;
    App._alertasCache = null;
    App.carregarAlertas().then(function (itens) {
      App.atualizarSininho(itens);
    }).catch(function (e) { console.error('CarWay sininho:', e); });
  },

  /* =========================================================
     SELETOR DE VEICULOS (chips "Todos" + um por veiculo)
     Compartilhado pelas 3 abas — filtra Monitoramento, Historico
     e Planos ao mesmo tempo.
     ========================================================= */

  iconeTipoVeiculo: function (tipo) {
    var m = {
      carro: 'directions_car', suv: 'directions_car', moto: 'two_wheeler',
      caminhao: 'local_shipping', onibus: 'directions_bus', van: 'airport_shuttle'
    };
    return m[tipo] || 'directions_car';
  },

  /* Mesma tabela de CORES_VEICULO definida em veiculos.js: o campo
     veiculo.cor guarda um TOKEN ('azul', 'laranja' etc.), nao um hex
     direto. Usar o token cru como cor CSS e invalido (o navegador
     ignora e cai no cinza padrao) — por isso a conversao e obrigatoria. */
  _CORES_VEICULO_HEX: {
    azul: '#3b82f6', verde: '#22c55e', roxo: '#a78bfa', laranja: '#f59e0b',
    vermelho: '#ef4444', ciano: '#22d3ee', rosa: '#ec4899', cinza: '#94a3b8'
  },

  corVeiculo: function (veiculo) {
    if (veiculo && veiculo.cor && Manutencoes._CORES_VEICULO_HEX[veiculo.cor]) {
      return Manutencoes._CORES_VEICULO_HEX[veiculo.cor];
    }
    var paleta = Manutencoes._PALETA_VEICULOS;
    var idx = 0;
    var id = (veiculo && veiculo.id) || '';
    for (var i = 0; i < id.length; i++) idx += id.charCodeAt(i);
    return paleta[idx % paleta.length];
  },

  veiculoPorId: function (id) {
    return Manutencoes.veiculos.filter(function (v) { return v.id === id; })[0] || null;
  },

  /* Registra (uma unica vez) um ouvinte na barra de veiculo GLOBAL
     (App.aoTrocarVeiculoAtivo, definida em app.js). Sempre que o
     usuario trocar o veiculo ativo em QUALQUER pagina do app — nao so
     em Manutencoes — este modulo e avisado e, se a pagina de
     Manutencoes estiver aberta na hora, se redesenha sozinho. */
  _registrarListenerVeiculoGlobal: function () {
    if (Manutencoes._listenerVeiculoRegistrado) return;
    if (typeof App === 'undefined' || !App.aoTrocarVeiculoAtivo) return;
    Manutencoes._listenerVeiculoRegistrado = true;
    App.aoTrocarVeiculoAtivo(function () {
      var pg = document.getElementById('pg-manutencao');
      if (pg && pg.classList.contains('ativa')) {
        Manutencoes._filtroMonitor = null;
        Manutencoes.renderAbaAtiva();
      }
    });
  },

  /* =========================================================
     HELPERS - CALCULOS
     ========================================================= */
  kmAtualDoVeiculo: function (veiculoId) {
    var km = 0;
    var veic = Manutencoes.veiculos.filter(function (v) { return v.id === veiculoId; })[0];
    if (veic) km = Math.max(km, Number(veic.kmInicial) || 0);
    Manutencoes.abastecimentos.forEach(function (a) {
      if (a.veiculoId === veiculoId) km = Math.max(km, Number(a.km) || 0);
    });
    Manutencoes.viagens.forEach(function (v) {
      if (v.veiculoId === veiculoId) km = Math.max(km, Number(v.kmFinal) || 0);
    });
    Manutencoes.lista.forEach(function (m) {
      if (m.veiculoId === veiculoId) km = Math.max(km, Number(m.km) || 0);
    });
    return km;
  },

  /* Retorna { km, data } do abastecimento mais relevante do veiculo
     (maior km registrado — em caso de empate, o mais recente por
     data). Usado apenas para EXIBIR ao usuario "km do ultimo
     abastecimento", como referencia visual separada da "referencia
     do plano" (kmBase/ultimoKm), que e outro numero. */
  ultimoAbastecimentoDoVeiculo: function (veiculoId) {
    var lista = Manutencoes.abastecimentos.filter(function (a) {
      return a.veiculoId === veiculoId && Number(a.km) > 0;
    });
    if (!lista.length) return null;
    lista.sort(function (a, b) {
      if (Number(a.km) !== Number(b.km)) return Number(b.km) - Number(a.km);
      return String(b.data || '').localeCompare(String(a.data || ''));
    });
    return lista[0];
  },

  /* Calcula o status (vencido/atencao/ok) de um item do plano.
     Suporta intervalo em KM, MESES ou DIAS. O limite de "atencao" por
     data e PROPORCIONAL ao tamanho do intervalo (10% do prazo, minimo
     2 dias, teto 30 dias), evitando que itens de intervalo curto
     fiquem permanentemente em "atencao". */
  calcularStatus: function (plano) {
    var veiculo = Manutencoes.veiculos.filter(function (v) { return v.id === plano.veiculoId; })[0];
    if (!veiculo) return null;
    var kmAtual = Manutencoes.kmAtualDoVeiculo(plano.veiculoId);
    var ultimoAbastecimento = Manutencoes.ultimoAbastecimentoDoVeiculo(plano.veiculoId);

    var ligadas = Manutencoes.lista.filter(function (m) {
      if (m.veiculoId !== plano.veiculoId) return false;
      if (m.planoId) return m.planoId === plano.id;
      return false;
    }).sort(function (a, b) {
      return (Number(b.km) || 0) - (Number(a.km) || 0);
    });

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
      kmAtual: kmAtual,
      ultimoKm: ultimoKm,
      ultimaData: ultimaData,
      ultimoAbastecimento: ultimoAbastecimento,
      proximoKm: proximoKm,
      kmRestante: kmRestante,
      temIntervaloKm: intervaloKm > 0,
      proximaData: proximaData,
      diasRestantes: diasRestantes,
      temIntervaloData: totalDiasIntervalo > 0,
      progresso: Math.min(100, Math.max(0, progresso)),
      status: status,
      motivo: motivos.join(' · ')
    };
  },

  /* Recalcula ultimoKm/ultimaData de UM plano a partir da linha de base
     (kmBase/dataBase) mais as manutencoes que ainda estao vinculadas a
     ele. Chamado sempre que uma manutencao vinculada e excluida, criada
     ou trocada de plano. */
  recalcularPlano: function (planoId) {
    if (!planoId) return Promise.resolve();
    var plano = Manutencoes.planos.filter(function (p) { return p.id === planoId; })[0];
    if (!plano) return Promise.resolve();

    return sb.from('manutencoes').select('km,data').eq('planoId', planoId).then(function (r) {
      var ligadas = r.data || [];
      var kmBase = Number(plano.kmBase != null ? plano.kmBase : plano.ultimoKm) || 0;
      var dataBase = plano.dataBase || plano.ultimaData || '';

      var novoUltimoKm = kmBase;
      var novaUltimaData = dataBase;

      ligadas.forEach(function (m) {
        if ((Number(m.km) || 0) > novoUltimoKm) novoUltimoKm = Number(m.km);
        if (String(m.data || '') > novaUltimaData) novaUltimaData = m.data;
      });

      return sb.from('planos').update({
        ultimoKm: novoUltimoKm,
        ultimaData: novaUltimaData
      }).eq('id', planoId);
    });
  },

  /* =========================================================
     ABA: MONITORAMENTO
     ========================================================= */
  renderMonitor: function () {
    var el = document.getElementById('conteudoManut');
    var planosAtivos = Manutencoes.planos.filter(function (p) {
      return String(p.ativo || 'SIM').toUpperCase() !== 'NAO';
    });

    if (planosAtivos.length === 0) {
      el.innerHTML =
          '<div class="vazio-veiculo">' +
          '<span class="ms">event_repeat</span>' +
          '<b>Nenhum plano de revisão</b>' +
          '<p>Crie um plano com os itens de manutenção preventiva para acompanhar as revisões do seu veículo.</p>' +
          '<button class="btn-novo" onclick="Manutencoes.criarPlanoPadrao()">' +
            '<span class="ms">auto_awesome</span> Criar plano padrão' +
          '</button>' +
        '</div>';
      return;
    }

    var itensTodos = planosAtivos.map(function (p) {
      return Manutencoes.calcularStatus(p);
    }).filter(function (x) { return x; });

    var ordem = { vencido: 0, atencao: 1, ok: 2 };
    itensTodos.sort(function (a, b) {
      return ordem[a.status] - ordem[b.status] || b.progresso - a.progresso;
    });

    /* Escopo dos KPIs e da lista: se ha veiculo filtrado, so aquele;
       senao, todos os veiculos (comportamento global de sempre). */
    var itensEscopo = App.veiculoAtivoId
      ? itensTodos.filter(function (x) { return x.plano.veiculoId === App.veiculoAtivoId; })
      : itensTodos;

    var vencidos = itensEscopo.filter(function (x) { return x.status === 'vencido'; }).length;
    var atencao = itensEscopo.filter(function (x) { return x.status === 'atencao'; }).length;
    var ok = itensEscopo.filter(function (x) { return x.status === 'ok'; }).length;

    var filtro = Manutencoes._filtroMonitor;

    function cardKpi(status, icone, cor, corFundo, valor, label) {
      var ativo = filtro === status;
      var estiloAtivo = ativo ? ('border-color:' + cor + ';box-shadow:0 0 0 2px ' + cor + '40') : '';
      return '<div onclick="Manutencoes.filtrarMonitor(\'' + status + '\')" class="kpi-abast" ' +
        'style="margin:0;cursor:pointer;' + estiloAtivo + '">' +
        '<span class="ms" style="background:' + corFundo + ';color:' + cor + '">' + icone + '</span>' +
        '<b>' + valor + '</b>' +
        '<span class="lbl">' + label + '</span>' +
      '</div>';
    }

    var html =
      '<div class="acoes-topo-manut">' +
        '<button class="btn-novo" onclick="App.irParaFormManutencao()">' +
          '<span class="ms">build</span> Lançar serviço' +
        '</button>' +
        '<button class="btn-novo-sec" onclick="Manutencoes.criarPlanoPadrao()">' +
          '<span class="ms">auto_awesome</span> Plano padrão' +
        '</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">' +
        cardKpi('vencido', 'error', '#ef4444', 'rgba(239,68,68,.15)', vencidos, 'Vencidos') +
        cardKpi('atencao', 'schedule', '#f59e0b', 'rgba(245,158,11,.15)', atencao, 'Próximos') +
        cardKpi('ok', 'check_circle', '#22c55e', 'rgba(34,197,94,.15)', ok, 'Em dia') +
      '</div>';

    if (App.veiculoAtivoId) {
      /* Veiculo especifico selecionado: lista simples, como antes */
      var itensFiltrados = filtro ? itensEscopo.filter(function (x) { return x.status === filtro; }) : itensEscopo;
      if (!itensFiltrados.length) {
        html +=
          '<div class="vazio-veiculo" style="padding:30px 16px">' +
            '<span class="ms">filter_alt_off</span>' +
            '<b>Nenhum item neste filtro</b>' +
            '<p>Toque novamente no card acima para limpar o filtro.</p>' +
          '</div>';
      } else {
        html += itensFiltrados.map(Manutencoes.cardMonitor).join('');
      }
    } else {
      /* "Todos": agrupa em blocos por veiculo, recolhidos por padrao */
      html += Manutencoes._renderBlocosPorVeiculo(itensTodos, filtro);
    }

    el.innerHTML = html;
  },

  /* Agrupa uma lista de itens (resultado de calcularStatus) por
     veiculoId e renderiza em blocos recolhiveis tipo "acordeon":
     abrir um bloco fecha o anterior automaticamente. Usado tanto no
     Monitoramento quanto (de forma similar) nos Planos. */
  _renderBlocosPorVeiculo: function (itens, filtroStatus) {
    var porVeiculo = {};
    itens.forEach(function (it) {
      var vid = it.plano.veiculoId;
      if (!porVeiculo[vid]) porVeiculo[vid] = [];
      porVeiculo[vid].push(it);
    });

    var veiculosComItens = Manutencoes.veiculos.filter(function (v) { return porVeiculo[v.id]; });

    if (!veiculosComItens.length) {
      return '<div class="vazio-veiculo" style="padding:30px 16px">' +
        '<span class="ms">filter_alt_off</span>' +
        '<b>Nenhum item encontrado</b>' +
      '</div>';
    }

    return veiculosComItens.map(function (v) {
      var todosDoVeic = porVeiculo[v.id];
      var vencidos = todosDoVeic.filter(function (x) { return x.status === 'vencido'; }).length;
      var atencao = todosDoVeic.filter(function (x) { return x.status === 'atencao'; }).length;
      var ok = todosDoVeic.filter(function (x) { return x.status === 'ok'; }).length;

      var itensExibidos = filtroStatus ? todosDoVeic.filter(function (x) { return x.status === filtroStatus; }) : todosDoVeic;
      if (filtroStatus && !itensExibidos.length) return ''; /* oculta bloco sem itens no filtro ativo */

      var aberto = Manutencoes._blocoAbertoMonitor === v.id;
      var cor = Manutencoes.corVeiculo(v);

      var badges = [];
      if (vencidos > 0) badges.push('<span style="color:#fca5a5;font-weight:700">' + vencidos + ' vencido' + (vencidos > 1 ? 's' : '') + '</span>');
      if (atencao > 0) badges.push('<span style="color:#fcd34d;font-weight:700">' + atencao + ' próximo' + (atencao > 1 ? 's' : '') + '</span>');
      if (!vencidos && !atencao) badges.push('<span style="color:#86efac">' + ok + ' em dia</span>');

      return '<div style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-left:4px solid ' + cor + ';border-radius:14px;margin-bottom:12px;overflow:hidden">' +
        '<button onclick="Manutencoes.toggleBlocoVeiculoMonitor(\'' + v.id + '\')" style="width:100%;display:flex;align-items:center;gap:10px;padding:13px 14px;background:transparent;border:0;cursor:pointer;font-family:inherit;text-align:left;color:var(--txt,#e8eefc)">' +
          '<span class="ms" style="font-size:22px;color:' + cor + '">' + Manutencoes.iconeTipoVeiculo(v.tipo) + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<b style="display:block;font-size:14px">' + App.esc(v.nome) + (v.placa ? ' <span style=\"font-weight:400;color:var(--txt2);font-size:12px\">· ' + App.esc(v.placa) + '</span>' : '') + '</b>' +
            '<small style="font-size:11.5px">' + badges.join(' · ') + ' · ' + todosDoVeic.length + ' item(ns)</small>' +
          '</div>' +
          '<span class="ms" style="color:var(--txt2)">' + (aberto ? 'expand_less' : 'expand_more') + '</span>' +
        '</button>' +
        (aberto ? '<div style="padding:0 12px 12px">' + itensExibidos.map(Manutencoes.cardMonitor).join('') + '</div>' : '') +
      '</div>';
    }).join('');
  },

  toggleBlocoVeiculoMonitor: function (veiculoId) {
    Manutencoes._blocoAbertoMonitor = (Manutencoes._blocoAbertoMonitor === veiculoId) ? null : veiculoId;
    Manutencoes.renderMonitor();
  },

  filtrarMonitor: function (status) {
    Manutencoes._filtroMonitor = (Manutencoes._filtroMonitor === status) ? null : status;
    Manutencoes.renderMonitor();
  },

  /* Card do Monitoramento — layout compacto em grade de 4 colunas,
     selo de status no canto superior direito, cores dinamicas
     conforme o status do item, e chip do veiculo (icone+nome+placa)
     para identificar de qual carro e o item mesmo dentro de um bloco. */
  cardMonitor: function (item) {
    var p = item.plano;
    var veic = Manutencoes.veiculoPorId(p.veiculoId);
    var ico = item.status === 'vencido' ? 'error' : (item.status === 'atencao' ? 'schedule' : 'check_circle');
    var statusLabel = item.status === 'vencido' ? 'Vencido' : (item.status === 'atencao' ? 'Atenção' : 'Em dia');
    var corStatus = item.status === 'vencido' ? '#ef4444' : (item.status === 'atencao' ? '#f59e0b' : '#22c55e');
    var corStatusFundo = item.status === 'vencido' ? 'rgba(239,68,68,.15)' : (item.status === 'atencao' ? 'rgba(245,158,11,.15)' : 'rgba(34,197,94,.15)');

    var det = [];
    if (Number(p.intervaloKm) > 0) det.push(App.fmtNum(p.intervaloKm) + ' km');
    if (Number(p.intervaloDias) > 0) det.push(p.intervaloDias + (Number(p.intervaloDias) === 1 ? ' dia' : ' dias'));
    else if (Number(p.intervaloMeses) > 0) det.push(p.intervaloMeses + (Number(p.intervaloMeses) === 1 ? ' mês' : ' meses'));

    var infoAbast = item.ultimoAbastecimento
      ? App.fmtNum(item.ultimoAbastecimento.km) + ' km · ' + Manutencoes.fmtData(item.ultimoAbastecimento.data)
      : 'nenhum abastecimento registrado';

    /* Chip do veiculo — so exibido quando "Todos" esta selecionado
       (dentro de um bloco ja se sabe o veiculo pelo cabecalho, mas o
       chip reforca a identificacao card a card, como no app original). */
    var corVeic = veic ? Manutencoes.corVeiculo(veic) : '#94a3b8';
    var chipVeiculo = veic
      ? '<span style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:11px;color:' + corVeic + ';font-weight:600">' +
          '<span class="ms" style="font-size:15px">' + Manutencoes.iconeTipoVeiculo(veic.tipo) + '</span>' +
          App.esc(veic.nome) + (veic.placa ? ' · ' + App.esc(veic.placa) : '') +
        '</span>'
      : '';

    /* Grade de 4 colunas, 2 pares rotulo/valor:
       [Próx. manut. -> km]  [faltam -> km restante]
       [Previsão manut. -> data]  [dias faltantes -> dias restantes]
       Todos os valores usam a cor do status (vermelho/amarelo/normal). */
    var corValor = item.status === 'ok' ? 'inherit' : corStatus;

    var proxKmTxt = item.proximoKm > 0 ? App.fmtNum(item.proximoKm) + ' km' : '—';
    var previsaoDataTxt = item.proximaData ? Manutencoes.fmtData(item.proximaData) : '—';

    var faltaKmTxt = '—';
    if (item.temIntervaloKm) {
      var venceuKm = item.kmRestante <= 0;
      faltaKmTxt = App.fmtNum(Math.abs(item.kmRestante)) + ' km' + (venceuKm ? ' exced.' : '');
    }

    var faltaDiasTxt = '—';
    if (item.temIntervaloData) {
      var venceuData = item.diasRestantes <= 0;
      var qtdDias = Math.abs(item.diasRestantes);
      faltaDiasTxt = String(qtdDias) + (venceuData ? ' venc.' : '');
    }

    var html =
      '<div class="card-manut ' + item.status + '" style="position:relative">' +
        '<span style="position:absolute;top:12px;right:12px;display:inline-flex;align-items:center;gap:4px;' +
          'background:' + corStatusFundo + ';color:' + corStatus + ';border-radius:99px;padding:4px 10px;' +
          'font-size:11px;font-weight:700">' +
          '<span class="ms" style="font-size:14px">' + ico + '</span>' + statusLabel +
        '</span>' +
        '<div class="cm-topo" style="margin-bottom:10px">' +
          '<div class="cm-icone"><span class="ms">' + ico + '</span></div>' +
          '<div class="cm-txt" style="padding-right:78px">' +
            '<b>' + App.esc(p.item) + '</b>' +
            '<small>' + App.esc(p.categoria || ('A cada ' + det.join(' ou '))) + '</small>' +
            chipVeiculo +
            '<small style="display:flex;align-items:center;gap:4px;margin-top:3px">' +
              '<span class="ms" style="font-size:14px;color:' + Manutencoes.CORICONEABASTECIMENTO + '">local_gas_station</span>' +
              'Último abastecimento: ' + infoAbast +
            '</small>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 0;border-top:1px solid var(--linha,#26365c);text-align:center">' +
          '<div><b style="display:block;font-size:13.5px;color:' + corValor + '">' + proxKmTxt + '</b><small style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Próx. manut.</small></div>' +
          '<div><b style="display:block;font-size:13.5px;color:' + corValor + '">' + faltaKmTxt + '</b><small style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Faltam</small></div>' +
          '<div><b style="display:block;font-size:13.5px;color:' + corValor + '">' + previsaoDataTxt + '</b><small style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Previsão manut.</small></div>' +
          '<div><b style="display:block;font-size:13.5px;color:' + corValor + '">' + faltaDiasTxt + '</b><small style="color:var(--txt2);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Dias faltantes</small></div>' +
        '</div>' +
        '<div class="cm-barra"><i style="width:' + item.progresso + '%;background:' + corStatus + '"></i></div>' +
        '<div class="cm-acoes">' +
          '<button class="pri" onclick="App.irParaFormManutencao(null, \'' + p.id + '\')">' +
            '<span class="ms">build</span> Lançar serviço' +
          '</button>' +
        '</div>' +
      '</div>';
    return html;
  },

  /* =========================================================
     ABA: HISTORICO
     ========================================================= */
  renderHistorico: function () {
    var el = document.getElementById('conteudoManut');

    if (Manutencoes.lista.length === 0) {
      el.innerHTML =
        '<div class="acoes-topo-manut">' +
          '<button class="btn-novo" onclick="App.irParaFormManutencao()">' +
            '<span class="ms">build</span> Lançar manutenção' +
          '</button>' +
          '<button class="btn-novo-sec" onclick="Manutencoes.exportarPDF()">' +
            '<span class="ms">picture_as_pdf</span> Exportar PDF' +
          '</button>' +
        '</div>' +
        '<div class="vazio-veiculo">' +
          '<span class="ms">history</span>' +
          '<b>Nenhuma manutenção registrada</b>' +
          '<p>Registre a primeira manutenção para começar o histórico.</p>' +
        '</div>';
      return;
    }

    var f = Manutencoes.filtroHist;
    var hoje = new Date();
    if (!f.ano) f.ano = hoje.getFullYear();
    if (!f.mes) f.mes = hoje.getMonth() + 1;

    var filtrados = Manutencoes.lista.filter(function (m) {
      if (!Manutencoes.noPeriodoHist(m.data)) return false;
      if (App.veiculoAtivoId && m.veiculoId !== App.veiculoAtivoId) return false;
      return true;
    });
    var ordenado = filtrados.slice().sort(function (a, b) {
      return String(b.data).localeCompare(String(a.data));
    });

    var totalServicos = ordenado.length;
    var totalCusto = ordenado.reduce(function (s, m) { return s + (Number(m.custo) || 0); }, 0);

    var html =
      '<div class="acoes-topo-manut">' +
        '<button class="btn-novo" onclick="App.irParaFormManutencao()">' +
          '<span class="ms">build</span> Lançar manutenção' +
        '</button>' +
        '<button class="btn-novo-sec" onclick="Manutencoes.exportarPDF()">' +
          '<span class="ms">picture_as_pdf</span> Exportar PDF' +
        '</button>' +
      '</div>' +
      Manutencoes.renderFiltroHistorico() +
      '<div class="kpis-abast" style="margin-bottom:18px">' +
        '<div class="kpi-abast roxo">' +
          '<span class="ms">build</span>' +
          '<b>' + totalServicos + '</b>' +
          '<span class="lbl">Serviços</span>' +
        '</div>' +
        '<div class="kpi-abast amarelo">' +
          '<span class="ms">payments</span>' +
          '<b>' + App.moeda(totalCusto) + '</b>' +
          '<span class="lbl">Total investido</span>' +
        '</div>' +
      '</div>';

    if (!ordenado.length) {
      html +=
        '<div class="vazio-veiculo" style="padding:30px 16px">' +
          '<span class="ms">event_busy</span>' +
          '<b>Nenhuma manutenção neste período</b>' +
          '<p>Troque o filtro acima para ver outros meses ou anos.</p>' +
        '</div>';
    } else {
      html += ordenado.map(Manutencoes.cardHistorico).join('');
    }

    el.innerHTML = html;
  },

  renderFiltroHistorico: function () {
    var f = Manutencoes.filtroHist;
    var anos = Manutencoes.anosDisponiveisHist();
    var htmlMes = MESES_PT.map(function (m, i) {
      return '<option value="' + (i + 1) + '"' + ((i + 1) === f.mes ? ' selected' : '') + '>' + m + '</option>';
    }).join('');
    var htmlAno = anos.map(function (a) {
      return '<option value="' + a + '"' + (String(a) === String(f.ano) ? ' selected' : '') + '>' + a + '</option>';
    }).join('');

    function estiloAba(sel) {
      return 'flex:1;background:' + (sel ? 'var(--azul,#3b82f6)' : 'transparent') +
        ';color:' + (sel ? '#fff' : 'var(--txt2,#93a4c8)') +
        ';border:0;border-radius:8px;padding:8px 4px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit';
    }
    var estiloSelect = 'flex:1;background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);' +
      'color:var(--txt,#e8eefc);border-radius:9px;padding:10px 8px;font-size:13.5px;font-weight:600;font-family:inherit';
    var estiloNav = 'background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);color:var(--azul2,#60a5fa);' +
      'width:36px;height:38px;border-radius:9px;display:grid;place-items:center;cursor:pointer;flex:none';

    var campos;
    if (f.modo === 'mes') {
      campos =
        '<button style="' + estiloNav + '" onclick="Manutencoes.navMesHist(-1)"><span class="ms">chevron_left</span></button>' +
        '<select style="' + estiloSelect + '" onchange="Manutencoes.setMesHist(this.value)">' + htmlMes + '</select>' +
        '<select style="' + estiloSelect + ';flex:0 0 88px" onchange="Manutencoes.setAnoHist(this.value)">' + htmlAno + '</select>' +
        '<button style="' + estiloNav + '" onclick="Manutencoes.navMesHist(1)"><span class="ms">chevron_right</span></button>';
    } else if (f.modo === 'ano') {
      campos =
        '<button style="' + estiloNav + '" onclick="Manutencoes.navAnoHist(-1)"><span class="ms">chevron_left</span></button>' +
        '<select style="' + estiloSelect + '" onchange="Manutencoes.setAnoHist(this.value)">' + htmlAno + '</select>' +
        '<button style="' + estiloNav + '" onclick="Manutencoes.navAnoHist(1)"><span class="ms">chevron_right</span></button>';
    } else {
      campos = '<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;' +
        'color:var(--txt2,#93a4c8);font-size:13px;padding:10px;background:var(--bg2,#111c33);border-radius:9px;' +
        'border:1px solid var(--linha,#26365c)"><span class="ms">all_inclusive</span>Todo o histórico</div>';
    }

    return '<div style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-radius:16px;' +
      'padding:10px;margin-bottom:14px">' +
        '<div style="display:flex;gap:5px;background:var(--bg2,#111c33);border-radius:10px;padding:4px;margin-bottom:9px">' +
          '<button style="' + estiloAba(f.modo === 'mes') + '" onclick="Manutencoes.setModoHist(\'mes\')">Mês</button>' +
          '<button style="' + estiloAba(f.modo === 'ano') + '" onclick="Manutencoes.setModoHist(\'ano\')">Ano</button>' +
          '<button style="' + estiloAba(f.modo === 'tudo') + '" onclick="Manutencoes.setModoHist(\'tudo\')">Tudo</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:7px">' + campos + '</div>' +
      '</div>';
  },

  noPeriodoHist: function (dataStr) {
    var f = Manutencoes.filtroHist;
    if (f.modo === 'tudo') return true;
    if (!dataStr) return false;
    var s = String(dataStr);
    if (f.modo === 'ano') return s.substring(0, 4) === String(f.ano);
    return s.substring(0, 7) === (f.ano + '-' + ('0' + f.mes).slice(-2));
  },

  anosDisponiveisHist: function () {
    var set = {};
    Manutencoes.lista.forEach(function (m) { if (m.data) set[String(m.data).substring(0, 4)] = 1; });
    set[String(new Date().getFullYear())] = 1;
    return Object.keys(set).sort().reverse();
  },

  setModoHist: function (m) { Manutencoes.filtroHist.modo = m; Manutencoes.renderHistorico(); },
  setMesHist: function (v) { Manutencoes.filtroHist.mes = parseInt(v, 10); Manutencoes.renderHistorico(); },
  setAnoHist: function (v) { Manutencoes.filtroHist.ano = parseInt(v, 10); Manutencoes.renderHistorico(); },
  navMesHist: function (d) {
    var f = Manutencoes.filtroHist;
    f.mes += d;
    if (f.mes > 12) { f.mes = 1; f.ano++; }
    if (f.mes < 1) { f.mes = 12; f.ano--; }
    Manutencoes.renderHistorico();
  },
  navAnoHist: function (d) { Manutencoes.filtroHist.ano += d; Manutencoes.renderHistorico(); },

  cardHistorico: function (m) {
    var veiculo = Manutencoes.veiculos.filter(function (v) { return v.id === m.veiculoId; })[0];
    var nomeVeic = veiculo ? veiculo.nome + (veiculo.placa ? ' · ' + veiculo.placa : '') : '';
    return '<div class="card-historico">' +
      '<div class="ch-topo">' +
        '<div class="ch-icone"><span class="ms">build</span></div>' +
        '<div class="ch-txt">' +
          '<b>' + App.esc(m.item || 'Manutenção') + '</b>' +
          '<small>' + App.esc(Manutencoes.fmtData(m.data)) + ' · ' + App.fmtNum(m.km) + ' km' + (nomeVeic ? ' · ' + App.esc(nomeVeic) : '') + '</small>' +
          (m.oficina ? '<small>' + App.esc(m.oficina) + '</small>' : '') +
        '</div>' +
        '<div class="ch-valor">' + App.moeda(m.custo) + '</div>' +
      '</div>' +
      '<div class="acoes-abast">' +
        '<button onclick="App.irParaFormManutencao(\'' + m.id + '\')"><span class="ms">edit</span> Editar</button>' +
        '<button class="excluir" onclick="Manutencoes.excluir(\'' + m.id + '\')"><span class="ms">delete</span> Excluir</button>' +
      '</div>' +
    '</div>';
  },

  /* =========================================================
     EXPORTAR PDF
     Organizado por veiculo: se ha um veiculo selecionado no seletor
     de chips, exporta so ele; se "Todos", exporta um relatorio com
     uma secao por veiculo (nova pagina a cada veiculo). Cada secao
     traz duas tabelas: "Ja realizado" (historico) e "Proximas
     manutencoes" (planos ativos, com km/dias faltantes e status).
     ========================================================= */
  exportarPDF: function () {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      App.toast('Biblioteca de PDF não carregada. Atualize a página (Ctrl+F5).', 'erro');
      return;
    }
    if (!Manutencoes.lista.length && !Manutencoes.planos.length) {
      App.toast('Nenhuma manutenção para exportar', 'erro');
      return;
    }

    App.toast('Gerando PDF...', 'ok');

    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });

    var veiculosEscopo = App.veiculoAtivoId
      ? Manutencoes.veiculos.filter(function (v) { return v.id === App.veiculoAtivoId; })
      : Manutencoes.veiculos.slice().sort(function (a, b) { return String(a.nome || '').localeCompare(String(b.nome || '')); });

    var manutencoesEscopo = App.veiculoAtivoId
      ? Manutencoes.lista.filter(function (m) { return m.veiculoId === App.veiculoAtivoId; })
      : Manutencoes.lista;

    var totalCusto = manutencoesEscopo.reduce(function (s, m) { return s + (Number(m.custo) || 0); }, 0);
    var vinculadasTotal = manutencoesEscopo.filter(function (m) { return !!m.planoId; });
    var avulsasTotal = manutencoesEscopo.filter(function (m) { return !m.planoId; });

    function nomePlanoItem(planoId) {
      var p = Manutencoes.planos.filter(function (x) { return x.id === planoId; })[0];
      return p ? p.item : '—';
    }

    /* ---- Capa / resumo geral ---- */
    doc.setFontSize(16);
    doc.text('CarWay - Relatório de Manutenções', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Organização: ' + ((typeof orgAtual !== 'undefined' && orgAtual && orgAtual.nome) || '-'), 14, 23);
    doc.text('Emitido em: ' + Manutencoes.fmtData(App.hojeISO()), 14, 28);
    if (App.veiculoAtivoId && veiculosEscopo[0]) {
      doc.text('Veículo: ' + veiculosEscopo[0].nome + (veiculosEscopo[0].placa ? ' - ' + veiculosEscopo[0].placa : ''), 14, 33);
    }
    doc.setTextColor(0);

    doc.setFontSize(11);
    doc.text('Resumo geral', 14, 42);
    doc.autoTable({
      startY: 45,
      theme: 'grid',
      styles: { fontSize: 9 },
      head: [['Veículos', 'Total de serviços', 'Total investido', 'Vinculados a plano', 'Avulsos']],
      body: [[
        String(veiculosEscopo.length),
        String(manutencoesEscopo.length),
        App.moeda(totalCusto),
        vinculadasTotal.length + ' (' + App.moeda(vinculadasTotal.reduce(function (s, m) { return s + (Number(m.custo) || 0); }, 0)) + ')',
        avulsasTotal.length + ' (' + App.moeda(avulsasTotal.reduce(function (s, m) { return s + (Number(m.custo) || 0); }, 0)) + ')'
      ]]
    });

    var y = doc.lastAutoTable.finalY + 12;

    if (!veiculosEscopo.length) {
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text('Nenhum veículo cadastrado.', 14, y);
    }

    veiculosEscopo.forEach(function (veic, idxVeic) {
      if (idxVeic > 0) { doc.addPage(); y = 16; }

      var manutVeic = manutencoesEscopo.filter(function (m) { return m.veiculoId === veic.id; })
        .slice().sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });

      var planosVeic = Manutencoes.planos.filter(function (p) {
        return p.veiculoId === veic.id && String(p.ativo || 'SIM').toUpperCase() !== 'NAO';
      });
      var statusVeic = planosVeic.map(function (p) { return Manutencoes.calcularStatus(p); }).filter(Boolean);
      var ordemStatus = { vencido: 0, atencao: 1, ok: 2 };
      statusVeic.sort(function (a, b) { return ordemStatus[a.status] - ordemStatus[b.status]; });

      doc.setFontSize(13);
      doc.setTextColor(0);
      doc.text(veic.nome + (veic.placa ? ' - ' + veic.placa : ''), 14, y);
      y += 4;

      var vencidosVeic = statusVeic.filter(function (x) { return x.status === 'vencido'; }).length;
      var atencaoVeic = statusVeic.filter(function (x) { return x.status === 'atencao'; }).length;
      var okVeic = statusVeic.filter(function (x) { return x.status === 'ok'; }).length;
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(vencidosVeic + ' vencido(s) · ' + atencaoVeic + ' próximo(s) · ' + okVeic + ' em dia', 14, y + 4);
      doc.setTextColor(0);
      y += 10;

      /* Tabela: Já realizado */
      doc.setFontSize(11);
      doc.text('Já realizado', 14, y);
      if (manutVeic.length) {
        doc.autoTable({
          startY: y + 3,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] },
          head: [['Data', 'Serviço', 'Vinculado a', 'KM', 'Custo', 'Oficina']],
          body: manutVeic.map(function (m) {
            return [
              Manutencoes.fmtData(m.data),
              m.item || '',
              m.planoId ? nomePlanoItem(m.planoId) : 'Avulso',
              App.fmtNum(m.km),
              App.moeda(m.custo),
              m.oficina || '—'
            ];
          })
        });
        y = doc.lastAutoTable.finalY + 8;
      } else {
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text('Nenhuma manutenção registrada para este veículo.', 14, y + 5);
        doc.setTextColor(0);
        y += 12;
      }

      if (y > 240) { doc.addPage(); y = 16; }

      /* Tabela: Próximas manutenções (plano ativo) */
      doc.setFontSize(11);
      doc.text('Próximas manutenções (plano)', 14, y);
      if (statusVeic.length) {
        doc.autoTable({
          startY: y + 3,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [167, 139, 250] },
          head: [['Item', 'Próx. KM', 'Faltam', 'Previsão', 'Dias', 'Status']],
          body: statusVeic.map(function (it) {
            return [
              it.plano.item || '',
              it.proximoKm > 0 ? App.fmtNum(it.proximoKm) + ' km' : '—',
              it.temIntervaloKm ? App.fmtNum(Math.abs(it.kmRestante)) + ' km' + (it.kmRestante <= 0 ? ' exced.' : '') : '—',
              it.proximaData ? Manutencoes.fmtData(it.proximaData) : '—',
              it.temIntervaloData ? String(Math.abs(it.diasRestantes)) + (it.diasRestantes <= 0 ? ' venc.' : '') : '—',
              it.status === 'vencido' ? 'Vencido' : (it.status === 'atencao' ? 'Atenção' : 'Em dia')
            ];
          })
        });
        y = doc.lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text('Nenhum plano de manutenção ativo para este veículo.', 14, y + 5);
        doc.setTextColor(0);
        y += 12;
      }
    });

    var totalPaginas = doc.internal.getNumberOfPages();
    for (var i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('Página ' + i + ' de ' + totalPaginas, 196, 290, { align: 'right' });
    }

    doc.save('carway-manutencoes-' + App.hojeISO() + '.pdf');
    App.toast('PDF gerado!', 'ok');
  },

  /* =========================================================
     ABA: PLANOS
     ========================================================= */
  renderPlanos: function () {
    var el = document.getElementById('conteudoManut');
    var topo =
      '<div class="acoes-topo-manut">' +
        '<button class="btn-novo" onclick="App.irParaFormPlano()">' +
          '<span class="ms">add</span> Novo item' +
        '</button>' +
        '<button class="btn-novo-sec" onclick="Manutencoes.criarPlanoPadrao()">' +
          '<span class="ms">auto_awesome</span> Plano padrão' +
        '</button>' +
      '</div>';

    if (Manutencoes.planos.length === 0) {
      el.innerHTML = topo +
        '<div class="vazio-veiculo">' +
          '<span class="ms">event_repeat</span>' +
          '<b>Nenhum item no plano</b>' +
          '<p>Adicione itens de manutenção preventiva para controlar quando cada um deve ser feito.</p>' +
        '</div>';
      return;
    }

    var planosOrdenados = Manutencoes.planos.slice().sort(function (a, b) {
      return String(a.item || '').localeCompare(String(b.item || ''));
    });

    var html = topo;

    if (App.veiculoAtivoId) {
      var doVeic = planosOrdenados.filter(function (p) { return p.veiculoId === App.veiculoAtivoId; });
      if (!doVeic.length) {
        html += '<div class="vazio-veiculo"><p>Nenhum item de plano para este veículo.</p></div>';
      } else {
        html += doVeic.map(Manutencoes.cardPlano).join('');
      }
    } else {
      html += Manutencoes._renderBlocosPlanosPorVeiculo(planosOrdenados);
    }

    el.innerHTML = html;
  },

  _renderBlocosPlanosPorVeiculo: function (planos) {
    var porVeiculo = {};
    planos.forEach(function (p) {
      if (!porVeiculo[p.veiculoId]) porVeiculo[p.veiculoId] = [];
      porVeiculo[p.veiculoId].push(p);
    });

    var veiculosComItens = Manutencoes.veiculos.filter(function (v) { return porVeiculo[v.id]; });
    if (!veiculosComItens.length) return '<div class="vazio-veiculo"><p>Nenhum item de plano cadastrado.</p></div>';

    return veiculosComItens.map(function (v) {
      var itens = porVeiculo[v.id];
      var aberto = Manutencoes._blocoAbertoPlanos === v.id;
      var cor = Manutencoes.corVeiculo(v);

      return '<div style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-left:4px solid ' + cor + ';border-radius:14px;margin-bottom:12px;overflow:hidden">' +
        '<button onclick="Manutencoes.toggleBlocoVeiculoPlanos(\'' + v.id + '\')" style="width:100%;display:flex;align-items:center;gap:10px;padding:13px 14px;background:transparent;border:0;cursor:pointer;font-family:inherit;text-align:left;color:var(--txt,#e8eefc)">' +
          '<span class="ms" style="font-size:22px;color:' + cor + '">' + Manutencoes.iconeTipoVeiculo(v.tipo) + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<b style="display:block;font-size:14px">' + App.esc(v.nome) + (v.placa ? ' <span style=\"font-weight:400;color:var(--txt2);font-size:12px\">· ' + App.esc(v.placa) + '</span>' : '') + '</b>' +
            '<small style="font-size:11.5px;color:var(--txt2)">' + itens.length + ' item(ns) no plano</small>' +
          '</div>' +
          '<span class="ms" style="color:var(--txt2)">' + (aberto ? 'expand_less' : 'expand_more') + '</span>' +
        '</button>' +
        (aberto ? '<div style="padding:0 12px 12px">' + itens.map(Manutencoes.cardPlano).join('') + '</div>' : '') +
      '</div>';
    }).join('');
  },

  toggleBlocoVeiculoPlanos: function (veiculoId) {
    Manutencoes._blocoAbertoPlanos = (Manutencoes._blocoAbertoPlanos === veiculoId) ? null : veiculoId;
    Manutencoes.renderPlanos();
  },

  cardPlano: function (p) {
    var detalhes = [];
    if (Number(p.intervaloKm) > 0) detalhes.push(App.fmtNum(p.intervaloKm) + ' km');
    if (Number(p.intervaloDias) > 0) detalhes.push(p.intervaloDias + (Number(p.intervaloDias) === 1 ? ' dia' : ' dias'));
    else if (Number(p.intervaloMeses) > 0) detalhes.push(p.intervaloMeses + (Number(p.intervaloMeses) === 1 ? ' mês' : ' meses'));

    var abst = Manutencoes.ultimoAbastecimentoDoVeiculo(p.veiculoId);
    var kmAtualTxt = abst
      ? (App.fmtNum(abst.km) + ' km · ' + Manutencoes.fmtData(abst.data))
      : 'nenhum abastecimento registrado';

    return '<div class="card-plano">' +
      '<div class="cp-topo">' +
        '<div class="cp-icone"><span class="ms">event_repeat</span></div>' +
        '<div class="cp-txt">' +
          '<b>' + App.esc(p.item) + '</b>' +
          '<small>A cada ' + detalhes.join(' ou ') + '</small>' +
          '<small>Referência do plano: ' + App.fmtNum(p.ultimoKm) + ' km · ' + App.esc(Manutencoes.fmtData(p.ultimaData)) + '</small>' +
          '<small style="display:flex;align-items:center;gap:4px">' +
            '<span class="ms" style="font-size:13px;color:' + Manutencoes.CORICONEABASTECIMENTO + '">local_gas_station</span>' +
            'Km atual do veículo: ' + kmAtualTxt +
          '</small>' +
        '</div>' +
      '</div>' +
      '<div class="acoes-abast">' +
        '<button onclick="App.irParaFormPlano(\'' + p.id + '\')"><span class="ms">edit</span> Editar</button>' +
        '<button class="excluir" onclick="Manutencoes.excluirPlano(\'' + p.id + '\')"><span class="ms">delete</span> Excluir</button>' +
      '</div>' +
    '</div>';
  },

  /* =========================================================
     CRIAR PLANO PADRAO
     ========================================================= */
  criarPlanoPadrao: function () {
    if (Manutencoes.veiculos.length === 0) {
      App.toast('Cadastre um veículo primeiro', 'erro');
      return;
    }
    if (Manutencoes.veiculos.length === 1) {
      Manutencoes._mostrarSugestoesPlano(Manutencoes.veiculos[0]);
      return;
    }
    var html = '<div class="campo-form"><label>Escolha o veículo</label>' +
      '<select id="planoVeic">' +
      Manutencoes.veiculos.map(function (v) {
        return '<option value="' + v.id + '">' + App.esc(v.nome) + ' · ' + App.esc(v.placa || 'sem placa') + '</option>';
      }).join('') +
      '</select></div>';
    App.abrirModal('Criar plano padrão', html, function () {
      var veicId = document.getElementById('planoVeic').value;
      var veic = Manutencoes.veiculos.filter(function (v) { return v.id === veicId; })[0];
      App.fecharModal();
      Manutencoes._mostrarSugestoesPlano(veic);
    }, 'Continuar');
  },

  _mostrarSugestoesPlano: function (veiculo) {
    var itens = Manutencoes.planosPadrao(veiculo.tipo, veiculo.combustivel);
    var listaHtml = itens.map(function (it, idx) {
      var det = [];
      if (it.intervaloKm > 0) det.push(App.fmtNum(it.intervaloKm) + ' km');
      if (it.intervaloDias > 0) det.push(it.intervaloDias + (it.intervaloDias === 1 ? ' dia' : ' dias'));
      else if (it.intervaloMeses > 0) det.push(it.intervaloMeses + (it.intervaloMeses === 1 ? ' mês' : ' meses'));
      return '<label class="plano-item">' +
        '<input type="checkbox" class="plano-chk" data-idx="' + idx + '" checked>' +
        '<div>' +
          '<b>' + App.esc(it.item) + '</b>' +
          '<small>' + det.join(' ou ') + '</small>' +
        '</div>' +
      '</label>';
    }).join('');
    var html =
      '<div style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.35);' +
        'border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.6;color:#bfdbfe">' +
        '<b>' + App.esc(veiculo.nome) + '</b><br>' +
        'Plano de manutenção preventiva sugerido para o tipo do veículo. ' +
        'Marque o que quiser acompanhar.' +
      '</div>' +
      '<div class="planos-lista">' + listaHtml + '</div>';
    App.abrirModal('Plano padrão', html, function () {
      var marcados = [];
      var chks = document.querySelectorAll('.plano-chk');
      for (var i = 0; i < chks.length; i++) {
        if (chks[i].checked) marcados.push(itens[parseInt(chks[i].getAttribute('data-idx'))]);
      }
      if (!marcados.length) {
        App.toast('Escolha pelo menos um item', 'erro');
        return;
      }
      App.fecharModal();
      Manutencoes._salvarPlanoPadrao(veiculo, marcados);
    }, 'Criar plano');
  },

  _salvarPlanoPadrao: function (veiculo, itens) {
    var kmBase = Manutencoes.kmAtualDoVeiculo(veiculo.id);
    var hoje = App.hojeISO();
    var registros = itens.map(function (it) {
      return {
        id: 'PLA_' + App.uid(),
        organizacaoId: orgAtual.id,
        veiculoId: veiculo.id,
        item: it.item,
        intervaloKm: it.intervaloKm || 0,
        intervaloMeses: it.intervaloMeses || 0,
        intervaloDias: it.intervaloDias || 0,
        ultimoKm: kmBase,
        ultimaData: hoje,
        kmBase: kmBase,
        dataBase: hoje,
        ativo: 'SIM',
        categoria: it.categoria || ''
      };
    });
    App.toast('Criando ' + registros.length + ' itens...', 'ok');
    sb.from('planos').insert(registros).then(function (r) {
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        return;
      }
      App.toast(registros.length + ' itens criados!', 'ok');
      Manutencoes.carregarTudo();
      Manutencoes._atualizarSininhoGlobal();
    });
  },

  planosPadrao: function (tipo, combustivel) {
    var comb = String(combustivel || '').toUpperCase();
    if (comb.indexOf('ELETR') > -1 || comb.indexOf('HÍBR') > -1 || comb.indexOf('HIBR') > -1) {
      return [
        { item: 'Pneus (checagem)', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Alinhamento e balanceamento', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Rodízio de pneus', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Pastilhas e discos de freio', intervaloKm: 20000, intervaloMeses: 12 },
        { item: 'Fluido de freio', intervaloKm: 40000, intervaloMeses: 24 },
        { item: 'Suspensão e direção (checagem)', intervaloKm: 20000, intervaloMeses: 12 },
        { item: 'Filtro de cabine', intervaloKm: 15000, intervaloMeses: 12 },
        { item: 'Bateria auxiliar 12V', intervaloKm: 0, intervaloMeses: 12 },
        { item: 'Sistema de alta tensão', intervaloKm: 20000, intervaloMeses: 12 },
        { item: 'Sistema de refrigeração da bateria', intervaloKm: 30000, intervaloMeses: 24 }
      ];
    }
    if (tipo === 'moto') {
      return [
        { item: 'Troca de óleo do motor', intervaloKm: 3000, intervaloMeses: 6 },
        { item: 'Filtro de óleo', intervaloKm: 6000, intervaloMeses: 12 },
        { item: 'Filtro de ar', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Vela de ignição', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Relação (corrente/coroa/pinhão)', intervaloKm: 15000, intervaloMeses: 18 },
        { item: 'Lubrificação da corrente', intervaloKm: 500, intervaloDias: 7 },
        { item: 'Pastilhas/lonas de freio', intervaloKm: 12000, intervaloMeses: 18 },
        { item: 'Fluido de freio', intervaloKm: 20000, intervaloMeses: 24 },
        { item: 'Pneus (checagem)', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Bateria (checagem)', intervaloKm: 0, intervaloMeses: 12 },
        { item: 'Revisão geral', intervaloKm: 6000, intervaloMeses: 6 }
      ];
    }
    if (tipo === 'caminhao' || tipo === 'onibus') {
      return [
        { item: 'Troca de óleo e filtro', intervaloKm: 15000, intervaloMeses: 6 },
        { item: 'Filtro de ar', intervaloKm: 20000, intervaloMeses: 12 },
        { item: 'Filtro de combustível', intervaloKm: 20000, intervaloMeses: 12 },
        { item: 'Filtro Racor/separador', intervaloKm: 20000, intervaloMeses: 12 },
        { item: 'Freios (checagem)', intervaloKm: 20000, intervaloMeses: 6 },
        { item: 'Sistema de ar', intervaloKm: 30000, intervaloMeses: 12 },
        { item: 'Diferencial e câmbio', intervaloKm: 60000, intervaloMeses: 24 },
        { item: 'Alinhamento', intervaloKm: 20000, intervaloMeses: 12 },
        { item: 'Rodízio de pneus', intervaloKm: 20000, intervaloMeses: 12 },
        { item: 'Revisão geral', intervaloKm: 20000, intervaloMeses: 6 }
      ];
    }
    if (tipo === 'van') {
      return [
        { item: 'Troca de óleo e filtro', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Filtro de ar', intervaloKm: 15000, intervaloMeses: 12 },
        { item: 'Filtro de combustível', intervaloKm: 15000, intervaloMeses: 12 },
        { item: 'Pastilhas de freio', intervaloKm: 25000, intervaloMeses: 18 },
        { item: 'Fluido de freio', intervaloKm: 40000, intervaloMeses: 24 },
        { item: 'Correia dentada', intervaloKm: 60000, intervaloMeses: 48 },
        { item: 'Alinhamento e balanceamento', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Rodízio de pneus', intervaloKm: 10000, intervaloMeses: 12 },
        { item: 'Suspensão (checagem)', intervaloKm: 30000, intervaloMeses: 24 },
        { item: 'Revisão geral', intervaloKm: 15000, intervaloMeses: 12 }
      ];
    }
    return [
      { item: 'Troca de óleo e filtro', intervaloKm: 10000, intervaloMeses: 12 },
      { item: 'Filtro de ar', intervaloKm: 20000, intervaloMeses: 24 },
      { item: 'Filtro de combustível', intervaloKm: 20000, intervaloMeses: 24 },
      { item: 'Filtro de cabine', intervaloKm: 15000, intervaloMeses: 12 },
      { item: 'Velas de ignição', intervaloKm: 40000, intervaloMeses: 36 },
      { item: 'Pastilhas de freio', intervaloKm: 30000, intervaloMeses: 24 },
      { item: 'Fluido de freio', intervaloKm: 40000, intervaloMeses: 24 },
      { item: 'Correia dentada', intervaloKm: 60000, intervaloMeses: 48 },
      { item: 'Alinhamento e balanceamento', intervaloKm: 10000, intervaloMeses: 12 },
      { item: 'Rodízio de pneus', intervaloKm: 10000, intervaloMeses: 12 },
      { item: 'Bateria (checagem)', intervaloKm: 0, intervaloMeses: 12 },
      { item: 'Revisão geral', intervaloKm: 20000, intervaloMeses: 12 }
    ];
  },

  /* =========================================================
     EXCLUIR
     ========================================================= */
  excluir: function (id) {
    var m = Manutencoes.lista.filter(function (x) { return x.id === id; })[0] || {};
    var item = m.item || 'esta manutenção';
    var planoAfetado = m.planoId || null;

    App.confirmar({
      titulo: 'Excluir manutenção',
      mensagem: 'A manutenção <b>' + App.esc(item) + '</b> será excluída permanentemente. ' +
        (planoAfetado ? 'O plano de revisão vinculado será recalculado automaticamente. ' : '') +
        'Se você quiser apenas atualizar os dados, edite ao invés de excluir.',
      textoBotao: 'Excluir manutenção',
      tipo: 'perigo',
      icone: 'build',
      aoConfirmar: function () {
        sb.from('manutencoes').delete().eq('id', id).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          (planoAfetado ? Manutencoes.recalcularPlano(planoAfetado) : Promise.resolve()).then(function () {
            App.toast('Manutenção excluída', 'ok');
            Manutencoes.carregarTudo();
            Manutencoes._atualizarSininhoGlobal();
          });
        });
      }
    });
  },

  excluirPlano: function (id) {
    var p = Manutencoes.planos.filter(function (x) { return x.id === id; })[0] || {};
    var item = p.item || 'este item do plano';
    App.confirmar({
      titulo: 'Excluir item do plano',
      mensagem: 'O item <b>' + App.esc(item) + '</b> será removido do plano de manutenção. ' +
        'O histórico de manutenções anteriores <b>não</b> será apagado.',
      textoBotao: 'Excluir item',
      tipo: 'perigo',
      icone: 'event_repeat',
      aoConfirmar: function () {
        sb.from('planos').delete().eq('id', id).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Item do plano excluído', 'ok');
          Manutencoes.carregarTudo();
          Manutencoes._atualizarSininhoGlobal();
        });
      }
    });
  },

  /* =========================================================
     FORM DE MANUTENCAO
     ========================================================= */
  abrirForm: function (id, planoIdPre, veiculoIdPre) {
    var precisaCarregar = Manutencoes.veiculos.length === 0;
    var carregar = precisaCarregar
      ? Promise.all([
          sb.from('veiculos').select('*').eq('organizacaoId', orgAtual.id).order('nome'),
          sb.from('planos').select('*').eq('organizacaoId', orgAtual.id)
        ]).then(function (rs) {
          Manutencoes.veiculos = rs[0].data || [];
          Manutencoes.planos = rs[1].data || [];
        })
      : Promise.resolve();
    carregar.then(function () {
      if (Manutencoes.veiculos.length === 0) {
        App.abrirModal('Veículo necessário',
          '<div style="text-align:center;padding:10px 0">' +
            '<span class="ms" style="font-size:56px;color:var(--txt2);opacity:0.5">directions_car</span>' +
            '<h3 style="margin:16px 0 10px">Cadastre um veículo primeiro</h3>' +
            '<p style="color:var(--txt2);font-size:14px;line-height:1.6;margin:0 0 20px">' +
              'Para lançar manutenções, você precisa cadastrar pelo menos um veículo.' +
            '</p>' +
          '</div>',
          function () { App.fecharModal(); App.irParaFormVeiculo(); },
          'Cadastrar veículo'
        );
        return;
      }
      if (id) {
        sb.from('manutencoes').select('*').eq('id', id).single().then(function (r) {
          if (r.error || !r.data) {
            App.toast('Manutenção não encontrada', 'erro');
            return;
          }
          Manutencoes.editando = r.data;
          Manutencoes.renderForm(planoIdPre, veiculoIdPre);
        });
      } else {
        Manutencoes.editando = null;
        Manutencoes.renderForm(planoIdPre, veiculoIdPre);
      }
    });
  },

  renderForm: function (planoIdPre, veiculoIdPre) {
    var m = Manutencoes.editando || {};
    var veiculos = Manutencoes.veiculos;
    var vSel = m.veiculoId || veiculoIdPre || App.veiculoAtivoId || veiculos[0].id;
    var dataHoje = App.hojeISO();
    var veicOpts = veiculos.map(function (v) {
      return '<option value="' + v.id + '"' + (v.id === vSel ? ' selected' : '') + '>' +
        App.esc(v.nome) + (v.placa ? ' · ' + App.esc(v.placa) : '') + '</option>';
    }).join('');
    var planosDoVeic = Manutencoes.planos.filter(function (p) { return p.veiculoId === vSel; });
    var planoSel = m.planoId || planoIdPre || '';
    var planoOpts = '<option value="">— Serviço avulso (não zera revisão) —</option>' +
      planosDoVeic.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === planoSel ? ' selected' : '') + '>' + App.esc(p.item) + '</option>';
      }).join('');
    var tipos = ['Preventiva', 'Corretiva', 'Revisão programada', 'Troca de peça', 'Pneus', 'Elétrica', 'Funilaria'];
    var tipoOpts = tipos.map(function (t) {
      return '<option value="' + t + '"' + (m.tipo === t ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
    var html =
      '<h2 class="form-titulo">' + (m.id ? 'Editar manutenção' : 'Nova manutenção') + '</h2>' +
      '<div class="campo-form"><label>Veículo</label>' +
        '<select id="mtVeiculo">' + veicOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Item do plano (zera revisão)</label>' +
        '<select id="mtPlano">' + planoOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Descrição do serviço</label>' +
        '<input type="text" id="mtItem" placeholder="Ex: Troca de óleo 5W30" value="' + App.esc(m.item || '') + '" maxlength="100">' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Data</label>' +
          '<input type="date" id="mtData" value="' + (m.data || dataHoje) + '">' +
        '</div>' +
        '<div class="campo-form"><label>KM</label>' +
          '<input type="number" id="mtKm" placeholder="0" value="' + (m.km || Manutencoes.kmAtualDoVeiculo(vSel) || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Tipo</label>' +
        '<select id="mtTipo">' + tipoOpts + '</select>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Custo</label>' +
          '<input type="number" id="mtCusto" step="0.01" placeholder="0,00" value="' + (m.custo || '') + '">' +
        '</div>' +
        '<div class="campo-form"><label>Oficina</label>' +
          '<input type="text" id="mtOficina" placeholder="Nome da oficina" value="' + App.esc(m.oficina || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Garantia (meses)</label>' +
          '<input type="number" id="mtGarantia" placeholder="0" value="' + (m.garantiaMeses || '') + '">' +
        '</div>' +
        '<div class="campo-form"><label>Nota fiscal</label>' +
          '<input type="text" id="mtNota" placeholder="Número" value="' + App.esc(m.nota || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Observações</label>' +
        '<textarea id="mtObs" rows="2" style="width:100%;background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;color:var(--txt);font-family:inherit;font-size:14px;resize:vertical">' + App.esc(m.obs || '') + '</textarea>' +
      '</div>' +
      '<div class="form-acoes">' +
        '<button class="btn-cancelar-form" onclick="App.irPara(\'manutencao\')">Cancelar</button>' +
        '<button class="btn-salvar-form" id="btnSalvarMt" onclick="Manutencoes.salvar()">' +
          (m.id ? 'Salvar alterações' : 'Registrar manutenção') +
        '</button>' +
      '</div>';
    document.getElementById('formManutencaoContainer').innerHTML = html;
  },

  salvar: function () {
    var veiculoId = document.getElementById('mtVeiculo').value;
    var planoId = document.getElementById('mtPlano').value || null;
    var item = document.getElementById('mtItem').value.trim();
    if (!veiculoId) { App.toast('Escolha o veículo', 'erro'); return; }
    if (!planoId && !item) { App.toast('Escolha o item do plano ou descreva o serviço', 'erro'); return; }

    if (planoId && !item) {
      var pl = Manutencoes.planos.filter(function (p) { return p.id === planoId; })[0];
      if (pl) item = pl.item;
    }

    var reg = {
      organizacaoId: orgAtual.id,
      usuarioId: usuarioAtual.id,
      veiculoId: veiculoId,
      planoId: planoId, /* null quando avulso */
      data: document.getElementById('mtData').value,
      km: Number(document.getElementById('mtKm').value) || 0,
      tipo: document.getElementById('mtTipo').value,
      item: item,
      custo: Number(document.getElementById('mtCusto').value) || 0,
      oficina: document.getElementById('mtOficina').value.trim(),
      garantiaMeses: Number(document.getElementById('mtGarantia').value) || 0,
      nota: document.getElementById('mtNota').value.trim(),
      obs: document.getElementById('mtObs').value.trim(),
      status: 'CONCLUIDA'
    };

    var planoAnterior = (Manutencoes.editando && Manutencoes.editando.planoId) ? Manutencoes.editando.planoId : null;

    var btn = document.getElementById('btnSalvarMt');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    var promise;
    if (Manutencoes.editando && Manutencoes.editando.id) {
      promise = sb.from('manutencoes').update(reg).eq('id', Manutencoes.editando.id);
    } else {
      reg.id = 'MNT_' + App.uid();
      promise = sb.from('manutencoes').insert(reg);
    }

    promise.then(function (r) {
      if (r.error) {
        btn.disabled = false;
        App.toast('Erro: ' + r.error.message, 'erro');
        btn.textContent = Manutencoes.editando ? 'Salvar alterações' : 'Registrar manutenção';
        return;
      }

      var afetados = [];
      if (planoId) afetados.push(planoId);
      if (planoAnterior && planoAnterior !== planoId) afetados.push(planoAnterior);

      Promise.all(afetados.map(Manutencoes.recalcularPlano)).then(function () {
        App.toast(Manutencoes.editando ? 'Atualizado!' : 'Manutenção registrada!', 'ok');
        App.irPara('manutencao');
        Manutencoes._atualizarSininhoGlobal();
      });
    });
  },

  /* =========================================================
     FORM DE PLANO
     ========================================================= */
  abrirFormPlano: function (id) {
    var precisaCarregar = Manutencoes.veiculos.length === 0;
    var carregar = precisaCarregar
      ? sb.from('veiculos').select('*').eq('organizacaoId', orgAtual.id).order('nome').then(function (r) {
          Manutencoes.veiculos = r.data || [];
        })
      : Promise.resolve();
    carregar.then(function () {
      if (Manutencoes.veiculos.length === 0) {
        App.toast('Cadastre um veículo primeiro', 'erro');
        return;
      }
      if (id) {
        sb.from('planos').select('*').eq('id', id).single().then(function (r) {
          if (r.error || !r.data) {
            App.toast('Plano não encontrado', 'erro');
            return;
          }
          Manutencoes.editandoPlano = r.data;
          Manutencoes.renderFormPlano();
        });
      } else {
        Manutencoes.editandoPlano = null;
        Manutencoes.renderFormPlano();
      }
    });
  },

  renderFormPlano: function () {
    var p = Manutencoes.editandoPlano || {};
    var veiculos = Manutencoes.veiculos;
    var vSel = p.veiculoId || App.veiculoAtivoId || veiculos[0].id;
    var veicOpts = veiculos.map(function (v) {
      return '<option value="' + v.id + '"' + (v.id === vSel ? ' selected' : '') + '>' +
        App.esc(v.nome) + (v.placa ? ' · ' + App.esc(v.placa) : '') + '</option>';
    }).join('');
    var html =
      '<h2 class="form-titulo">' + (p.id ? 'Editar item do plano' : 'Novo item do plano') + '</h2>' +
      '<div class="campo-form"><label>Veículo</label>' +
        '<select id="plVeiculo">' + veicOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Item</label>' +
        '<input type="text" id="plItem" placeholder="Ex: Troca de óleo e filtro" value="' + App.esc(p.item || '') + '" maxlength="80">' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Intervalo (km)</label>' +
          '<input type="number" id="plIntervaloKm" placeholder="10000" value="' + (p.intervaloKm || '') + '">' +
        '</div>' +
        '<div class="campo-form"><label>Intervalo (meses)</label>' +
          '<input type="number" id="plIntervaloMeses" placeholder="12" value="' + (p.intervaloMeses || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Intervalo (dias) — opcional, para itens muito frequentes</label>' +
        '<input type="number" id="plIntervaloDias" placeholder="Ex.: 7 para lubrificação semanal" value="' + (p.intervaloDias || '') + '">' +
        '<small>Se preenchido, este campo tem prioridade sobre "meses". Use para itens semanais/quinzenais (ex.: lubrificação de corrente, checagem de pneus de moto). Deixe em branco para itens mensais/anuais normais.</small>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Último KM (referência do plano)</label>' +
          '<input type="number" id="plUltimoKm" placeholder="0" value="' + (p.ultimoKm || Manutencoes.kmAtualDoVeiculo(vSel) || '') + '">' +
        '</div>' +
        '<div class="campo-form"><label>Última data (referência do plano)</label>' +
          '<input type="date" id="plUltimaData" value="' + (p.ultimaData || App.hojeISO()) + '">' +
        '</div>' +
      '</div>' +
      '<small style="display:block;margin:-8px 0 16px;color:var(--txt2);font-size:12px;line-height:1.5">' +
        'Estes dois campos marcam quando este item foi feito pela última vez — é a partir deles que o próximo ' +
        'prazo é calculado. Não é o mesmo que o hodômetro atual do veículo (esse vem dos abastecimentos).' +
        (p.id
          ? ' Editar aqui não altera a linha de base usada para recalcular o plano se uma manutenção vinculada for excluída no futuro.'
          : '') +
      '</small>' +
      '<div class="form-acoes">' +
        '<button class="btn-cancelar-form" onclick="App.irPara(\'manutencao\')">Cancelar</button>' +
        '<button class="btn-salvar-form" id="btnSalvarPl" onclick="Manutencoes.salvarPlano()">' +
          (p.id ? 'Salvar alterações' : 'Criar item') +
        '</button>' +
      '</div>';
    document.getElementById('formPlanoContainer').innerHTML = html;
  },

  salvarPlano: function () {
    var veiculoId = document.getElementById('plVeiculo').value;
    var item = document.getElementById('plItem').value.trim();
    if (!veiculoId) { App.toast('Escolha o veículo', 'erro'); return; }
    if (!item) { App.toast('Informe o item', 'erro'); return; }

    var ultimoKm = Number(document.getElementById('plUltimoKm').value) || 0;
    var ultimaData = document.getElementById('plUltimaData').value;

    var reg = {
      organizacaoId: orgAtual.id,
      veiculoId: veiculoId,
      item: item,
      intervaloKm: Number(document.getElementById('plIntervaloKm').value) || 0,
      intervaloMeses: Number(document.getElementById('plIntervaloMeses').value) || 0,
      intervaloDias: Number(document.getElementById('plIntervaloDias').value) || 0,
      ultimoKm: ultimoKm,
      ultimaData: ultimaData,
      ativo: 'SIM'
    };

    var criandoNovo = !(Manutencoes.editandoPlano && Manutencoes.editandoPlano.id);
    if (criandoNovo) {
      reg.kmBase = ultimoKm;
      reg.dataBase = ultimaData;
    }

    var btn = document.getElementById('btnSalvarPl');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    var promise;
    if (!criandoNovo) {
      promise = sb.from('planos').update(reg).eq('id', Manutencoes.editandoPlano.id);
    } else {
      reg.id = 'PLA_' + App.uid();
      promise = sb.from('planos').insert(reg);
    }
    promise.then(function (r) {
      btn.disabled = false;
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        btn.textContent = criandoNovo ? 'Criar item' : 'Salvar alterações';
        return;
      }
      App.toast(criandoNovo ? 'Item criado!' : 'Atualizado!', 'ok');
      Manutencoes.aba = 'planos';
      App.irPara('manutencao');
      Manutencoes._atualizarSininhoGlobal();
    });
  },

  /* =========================================================
     UTILITARIOS
     ========================================================= */
  fmtData: function (s) {
    if (!s) return '—';
    var p = String(s).substring(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s;
  }
};
