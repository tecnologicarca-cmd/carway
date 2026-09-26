/* APP_VERSION: v9.2 */
/* =====================================================================
   CARWAY v16 - VIAGENS
   Planejador completo com Google Routes + Geocoding + Places
   via Edge Functions + verificação de manutenção.

   v9.2 (esta versão) — ajustes de layout e correção do Orçado x Realizado
   - NOVO: bloco de informação do veículo (planejador, resultados de rota
     e tela final de criar viagem) agora fica em UMA ÚNICA LINHA: ícone +
     nome + placa, e à direita ícone (bomba vermelha ou bateria/recarga
     verde para elétrico) + "Combustível: X". Antes ficava empilhado em
     3 linhas separadas. Um único helper (_veiculoBlocoHTML) é usado nos
     4 lugares onde esse bloco aparece — inclusive na edição de viagem,
     que reaproveita a mesma tela.
   - CORRIGIDO: botão "Cancelar" do planejador (e da edição) agora usa a
     classe padrão arredondada do app (btn-cancelar-form) em vez de um
     estilo quadrado fora do padrão.
   - RENOMEADO: botão "Buscar rotas" → "Criar viagem" (mesma função,
     só o texto mudou), a pedido do usuário.
   - MELHORADO: disposição dos botões do planejador — "Cancelar" e
     "Abrir no Maps" ficam lado a lado (mesma largura), com o botão
     principal ("Criar viagem"/"Salvar alterações") abaixo, em largura
     total — mesmo padrão usado em outras telas do app.
   - NOVO: na lista de viagens, o botão "Nova viagem" foi renomeado para
     "Criar nova viagem" e movido para o TOPO da página (acima de
     Postos/PDF, filtro de período e KPIs). Os chips de status
     (Todos/Em andamento/Planejadas/Concluídas) foram movidos para onde
     o botão "Nova viagem" ficava antes — logo acima da lista de cards.
   - CORRIGIDO: nos cards da lista com status "Planejada", os botões
     Ver / Iniciar / Excluir (lixeira) agora ficam sempre na MESMA
     linha (antes a lixeira quebrava para uma linha própria).
   - CORRIGIDO: botões Encerrar/Editar/Orçamento/Excluir no topo do
     detalhe da viagem agora seguem o padrão visual do app (botões
     secundários uniformes, em vez de pilulas pequenas fora do padrão).
   - CORRIGIDO (bug importante): o gráfico "Orçado x Realizado" sempre
     jogava TODO o valor gasto (alimentação, hospedagem, pedágio) dentro
     da barra "Outros", porque a tela nunca separava os valores reais
     por categoria (só o PDF fazia essa separação corretamente). Agora
     a tela também separa por categoria (Alimentação/Hospedagem/Pedágio/
     Outros), então cada barra cresce com o valor certo.
   - CORRIGIDO: botões "Abasteci aqui" / "Já lancei" / "Não parei" (nas
     paradas já salvas da viagem) agora seguem o padrão visual do app,
     com os 3 na mesma largura/estilo.
   - REMOVIDO: botão "Refazer" no mapa do detalhe (redundante — já existe
     "Editar" no topo da página). "Tela cheia" e "Postos" agora ficam
     lado a lado, e "Exportar viagem em PDF" fica abaixo, centralizado
     e em largura total.
   - REMOVIDO (redundância): a seção "Abastecimentos" no detalhe da
     viagem só aparece agora quando a viagem NÃO tem paradas planejadas
     — quando há paradas, os abastecimentos vinculados já aparecem
     dentro de cada parada concluída, então repetir a lista embaixo
     era informação duplicada.
   ===================================================================== */
var Viagens = {
  lista: [],
  veiculos: [],
  abastecimentos: [],
  despesas: [],
  manutencoes: [],
  editando: null,
  _modoEdicao: false,
  _topoOrganizado: false,
  _origemOriginalTxt: '',
  _destinoOriginalTxt: '',
  _idaVoltaOriginal: false,
  _salvando: false,
  _mapaFull: null,
  _marcadoresExtras: [],
  periodo: { modo: 'mes', ano: 0, mes: 0 },
  filtroStatus: 'todos',
  plano: {
    origem: null,
    destino: null,
    idaVolta: false,
    rotas: null,
    rotaAtiva: 0,
    paradasPorRota: {},
    veiculoSelecionado: null,
    parametrosAutonomia: null
  },
  _sug: {
    origem: { timer: null, ultimoTexto: '', resultados: [] },
    destino: { timer: null, ultimoTexto: '', resultados: [] }
  },
  _chaveHistorico: 'carway_enderecos_recentes',
  _paradasGrupoAberto: { IDA: false, VOLTA: false },

  /* =========================================================
     EDGE FUNCTIONS
     ========================================================= */
  _processarRespostaFuncao: function (resposta, nomeFuncao) {
  var tipo = resposta.headers.get('content-type') || '';

  if (tipo.indexOf('application/json') === -1) {
    return resposta.text().then(function (texto) {
      console.error('CarWay ' + nomeFuncao + ' - resposta não é JSON:', resposta.status, texto.substring(0, 300));

      if (resposta.status === 401 || resposta.status === 403) {
        throw new Error('Sua sessão expirou. Saia e entre novamente no app.');
      }

      if (resposta.status === 404) {
        throw new Error('Serviço de mapas indisponível no momento.');
      }

      if (resposta.status >= 500) {
        throw new Error('O serviço de mapas está fora do ar. Tente novamente em instantes.');
      }

      throw new Error('Resposta inesperada do serviço de mapas.');
    });
  }

  return resposta.json().then(function (dados) {
    if (!resposta.ok) {
      var mensagem = (dados && (dados.erro || dados.error || dados.message)) || '';

      console.error('CarWay ' + nomeFuncao + ' - erro ' + resposta.status + ':', mensagem);

      if (resposta.status === 401 || resposta.status === 403) {
        throw new Error('Sua sessão expirou. Saia e entre novamente no app.');
      }

      if (resposta.status === 429) {
        throw new Error('Muitas consultas seguidas. Aguarde alguns segundos.');
      }

      if (resposta.status >= 500) {
        throw new Error('O serviço de mapas está instável. Tente novamente.');
      }

      throw new Error(mensagem || 'Não foi possível consultar o serviço de mapas.');
    }

    if (dados && dados.erro) {
      console.error('CarWay ' + nomeFuncao + ' - erro retornado:', dados.erro);
      throw new Error(dados.erro);
    }

    return dados;
  }).catch(function (e) {
    if (e instanceof SyntaxError) {
      console.error('CarWay ' + nomeFuncao + ' - JSON inválido');
      throw new Error('Resposta inválida do serviço de mapas.');
    }

    throw e;
  });
},
   
chamarRoutes: function (origem, destino, idaVolta, emissionType) {
  var url = CARWAY_CONFIG.SUPABASE_URL + '/functions/v1/google-routes';

  return sb.auth.getSession().then(function (r) {
    var token = r.data && r.data.session ? r.data.session.access_token : '';

    if (!token) throw new Error('Sessão expirada. Faça login novamente.');

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': CARWAY_CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        origem: { lat: origem.lat, lon: origem.lon },
        destino: { lat: destino.lat, lon: destino.lon },
        idaVolta: !!idaVolta,
        emissionType: emissionType || 'GASOLINE'
      })
    }).catch(function () {
      throw new Error('Sem conexão com a internet. Verifique sua rede.');
    });
  }).then(function (resposta) {
    return Viagens._processarRespostaFuncao(resposta, 'google-routes');
  }).then(function (dados) {
    return dados.rotas || [];
  });
},
  chamarGeocode: function (params) {
  var url = CARWAY_CONFIG.SUPABASE_URL + '/functions/v1/google-geocode';

  return sb.auth.getSession().then(function (r) {
    var token = r.data && r.data.session ? r.data.session.access_token : '';

    if (!token) throw new Error('Sessão expirada. Faça login novamente.');

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': CARWAY_CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify(params)
    }).catch(function () {
      throw new Error('Sem conexão com a internet. Verifique sua rede.');
    });
  }).then(function (resposta) {
    return Viagens._processarRespostaFuncao(resposta, 'google-geocode');
  }).then(function (dados) {
    return dados.resultados || [];
  });
},

   chamarPlaces: function (lat, lon, raio, limite, tipo) {
  var url = CARWAY_CONFIG.SUPABASE_URL + '/functions/v1/google-places';

  return sb.auth.getSession().then(function (r) {
    var token = r.data && r.data.session ? r.data.session.access_token : '';

    if (!token) throw new Error('Sessão expirada. Faça login novamente.');

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': CARWAY_CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        lat: lat,
        lon: lon,
        raio: raio || 10000,
        limite: limite || 8,
        tipo: tipo || 'gas_station'
      })
    }).catch(function () {
      throw new Error('Sem conexão com a internet. Verifique sua rede.');
    });
  }).then(function (resposta) {
    return Viagens._processarRespostaFuncao(resposta, 'google-places');
  }).then(function (dados) {
    return dados.locais || [];
  });
},
  /* =========================================================
     DETECÇÃO DE DISPOSITIVO
     ========================================================= */
  ehDispositivoMovel: function () {
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return true;
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true;
    if (/Windows Phone/i.test(ua)) return true;
    var temTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return temTouch && window.innerWidth < 768;
  },

  /* =========================================================
     BLOCO DO VEÍCULO — helper único, em UMA linha (ícone + nome +
     placa + ícone de combustível/recarga + nome do combustível).
     Usado no planejador, na troca de veículo, nos resultados de rota
     e na tela final de criar viagem — assim os 4 lugares ficam
     sempre idênticos e consistentes.
     ========================================================= */
  _iconeCombustivelInfo: function (combustivel) {
    var c = String(combustivel || '').toUpperCase();
    if (c.indexOf('ELÉTR') > -1 || c.indexOf('ELETR') > -1) {
      return { icone: 'ev_station', cor: '#22c55e' };
    }
    return { icone: 'local_gas_station', cor: '#ef4444' };
  },
  _veiculoBlocoHTML: function (veic, comId) {
    var corVeic = App._corVeiculo ? App._corVeiculo(veic) : '#3b82f6';
    var icoVeic = App._iconeTipoVeiculo ? App._iconeTipoVeiculo(veic.tipo) : 'directions_car';
    var comb = Viagens._iconeCombustivelInfo(veic.combustivel);
    return '<div class="veic-unico"' + (comId ? ' id="' + comId + '"' : '') +
      ' style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;border-color:' + corVeic + '44">' +
      '<span class="ms" style="color:' + corVeic + ';font-size:24px;flex:none">' + icoVeic + '</span>' +
      '<b style="white-space:nowrap">' + App.esc(veic.nome) + '</b>' +
      '<span style="color:var(--txt2);font-size:12.5px;white-space:nowrap">· ' + App.esc(veic.placa || 'sem placa') + '</span>' +
      '<span style="display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:12px;white-space:nowrap">' +
        '<span class="ms" style="color:' + comb.cor + ';font-size:16px">' + comb.icone + '</span>' +
        'Combustível: <b style="color:' + comb.cor + '">' + App.esc(veic.combustivel || '—') + '</b>' +
      '</span>' +
    '</div>';
  },

  /* =========================================================
     HISTÓRICO DE ENDEREÇOS
     ========================================================= */
  lerHistorico: function () {
    try {
      var txt = localStorage.getItem(Viagens._chaveHistorico);
      if (!txt) return [];
      var lista = JSON.parse(txt);
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  },
  gravarHistorico: function (endereco) {
    if (!endereco || endereco.length < 5) return;
    try {
      var lista = Viagens.lerHistorico();
      lista = lista.filter(function (e) { return e.endereco !== endereco; });
      lista.unshift({ endereco: endereco, quando: Date.now() });
      lista = lista.slice(0, 10);
      localStorage.setItem(Viagens._chaveHistorico, JSON.stringify(lista));
    } catch (e) {}
  },

  _listenerVeiculoRegistrado: false,
  _registrarListenerVeiculoGlobal: function () {
    if (Viagens._listenerVeiculoRegistrado) return;
    if (typeof App === 'undefined' || !App.aoTrocarVeiculoAtivo) return;
    Viagens._listenerVeiculoRegistrado = true;
    App.aoTrocarVeiculoAtivo(function (veiculoId) {
      var pgLista = document.getElementById('pg-viagens');
      if (pgLista && pgLista.classList.contains('ativa')) {
        Viagens.renderKpis();
        Viagens.renderTudo();
      }
      var pgPlano = document.getElementById('pg-viagem-plano');
      if (pgPlano && pgPlano.classList.contains('ativa')) {
        Viagens._sincronizarFormComVeiculoGlobal(veiculoId);
      }
    });
  },
  _sincronizarFormComVeiculoGlobal: function (veiculoId) {
    if (!veiculoId) return;
    var sel = document.getElementById('plVeiculo');
    if (!sel) return;
    var existe = Viagens.veiculos.some(function (v) { return v.id === veiculoId; });
    if (!existe || sel.value === veiculoId) return;
    sel.value = veiculoId;
    Viagens.trocarVeiculoPlano();
  },
  /* =========================================================
     LISTA DE VIAGENS
     ========================================================= */
  carregarLista: function () {
    var el = document.getElementById('blocoEmAndamento');
    if (el) el.innerHTML = '<div class="bloco-vazio">Carregando...</div>';
    var hoje = new Date();
    if (!Viagens.periodo.ano) {
      Viagens.periodo.ano = hoje.getFullYear();
      Viagens.periodo.mes = hoje.getMonth() + 1;
    }
    Viagens._registrarListenerVeiculoGlobal();
    Promise.all([
      sb.from('viagens').select('*').eq('organizacaoId', orgAtual.id).order('dataInicio', { ascending: false }),
      sb.from('veiculos').select('id, nome, placa, tanque, combustivel, tipo, cor').eq('organizacaoId', orgAtual.id),
      sb.from('abastecimentos').select('viagemId, veiculoId, valorTotal, litros, precoLitro, data').eq('organizacaoId', orgAtual.id),
      sb.from('despesas').select('viagemId, valor').eq('organizacaoId', orgAtual.id),
      sb.from('manutencoes').select('viagemId, custo').eq('organizacaoId', orgAtual.id)
    ]).then(function (r) {
      Viagens.lista = r[0].data || [];
      Viagens.veiculos = r[1].data || [];
      Viagens.abastecimentos = r[2].data || [];
      Viagens.despesas = r[3].data || [];
      Viagens.manutencoes = r[4].data || [];
      Viagens._garantirContainersTopo();
      Viagens.renderFiltroPeriodo();
      Viagens.renderChipsStatus();
      Viagens.renderKpis();
      Viagens.renderTudo();
      Viagens._organizarTopoViagens();
    });
  },

  _garantirContainersTopo: function () {
    if (document.getElementById('chipsStatusViagens')) return;
    var filtroEl = document.getElementById('filtroViagens');
    var kpisEl = document.getElementById('kpisViagens');
    var ancoraDestino = filtroEl || kpisEl;
    if (!ancoraDestino || !ancoraDestino.parentNode) return;
    var chips = document.createElement('div');
    chips.id = 'chipsStatusViagens';
    var acoes = document.createElement('div');
    acoes.id = 'acoesTopoViagens';
    ancoraDestino.parentNode.insertBefore(chips, ancoraDestino);
    ancoraDestino.parentNode.insertBefore(acoes, ancoraDestino);
  },

  /* Reorganiza o topo da página (uma única vez): renomeia o botão
     nativo "Nova viagem" para "Criar nova viagem", move esse botão
     para o TOPO da página, e move os chips de status para onde o
     botão ficava antes (logo acima da lista de cards). Feito via DOM
     (sem editar index.html), com verificações defensivas em cada
     passo — se algum elemento não for encontrado, simplesmente não
     mexe naquela parte, sem quebrar o resto da página. */
    _organizarTopoViagens: function () {
    if (Viagens._topoOrganizado) return;
    var pg = document.getElementById('pg-viagens');
    if (!pg) return;
    try {
      var botoes = pg.querySelectorAll('button');
      var botaoNovo = null;
      for (var i = 0; i < botoes.length; i++) {
        var txt = (botoes[i].textContent || '').trim().toLowerCase();
        if (txt.indexOf('nova viagem') > -1 && txt.indexOf('criar') === -1) { botaoNovo = botoes[i]; break; }
      }
      if (botaoNovo) {
        var icone = botaoNovo.querySelector('.ms');
        botaoNovo.innerHTML = (icone ? icone.outerHTML : '<span class="ms">add</span>') + ' Criar nova viagem';
        botaoNovo.classList.add('bloco-full');
        var wrapperBotao = botaoNovo.closest('.acoes-topo') || botaoNovo.parentNode;
        if (!wrapperBotao || wrapperBotao === pg) wrapperBotao = botaoNovo;
        var kpisEl = document.getElementById('kpisViagens');
        var containerPrincipal = kpisEl && kpisEl.parentNode ? kpisEl.parentNode : wrapperBotao.parentNode;
        if (containerPrincipal && containerPrincipal.firstChild && wrapperBotao !== containerPrincipal) {
          containerPrincipal.insertBefore(wrapperBotao, containerPrincipal.firstChild);
        }
      }
      var chips = document.getElementById('chipsStatusViagens');
      var lista = document.getElementById('blocoEmAndamento');
      if (chips && lista && lista.parentNode) {
        lista.parentNode.insertBefore(chips, lista);
      }
      Viagens._topoOrganizado = true;
    } catch (e) {
      console.warn('CarWay: não foi possível reorganizar o topo de Viagens:', e);
    }
  },

  renderChipsStatus: function () {
    var el = document.getElementById('chipsStatusViagens');
    if (!el) return;
    var listaPeriodo = Viagens.lista.filter(function (v) { return Viagens._noPeriodo(v); });
    var qtdAndamento = listaPeriodo.filter(function (v) { return v.status === 'andamento'; }).length;
    var qtdPlanejada = listaPeriodo.filter(function (v) { return v.status === 'planejada'; }).length;
    var qtdConcluida = listaPeriodo.filter(function (v) { return v.status === 'concluida'; }).length;

    function chip(valor, icone, cor, label, qtd) {
      var sel = Viagens.filtroStatus === valor;
      return '<button onclick="Viagens.setFiltroStatus(\'' + valor + '\')" style="' +
        'flex:none;display:flex;align-items:center;gap:6px;padding:9px 14px;border-radius:99px;' +
        'font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;' +
        'background:' + (sel ? cor + '26' : 'var(--card,#16213b)') + ';' +
        'border:1.5px solid ' + (sel ? cor : 'var(--linha,#26365c)') + ';' +
        'color:' + (sel ? cor : 'var(--txt,#e8eefc)') + '">' +
        '<span class="ms" style="font-size:16px;color:' + cor + '">' + icone + '</span>' +
        label + ' (' + qtd + ')' +
      '</button>';
    }

    el.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;margin-bottom:12px;-webkit-overflow-scrolling:touch';
    el.innerHTML =
      chip('todos', 'apps', '#60a5fa', 'Todos', listaPeriodo.length) +
      chip('andamento', 'directions_run', '#f59e0b', 'Em andamento', qtdAndamento) +
      chip('planejada', 'schedule', '#3b82f6', 'Planejadas', qtdPlanejada) +
      chip('concluida', 'check_circle', '#22c55e', 'Concluídas', qtdConcluida);
  },

  setFiltroStatus: function (v) {
    Viagens.filtroStatus = v;
    Viagens.renderChipsStatus();
    Viagens.renderTudo();
  },

  renderFiltroPeriodo: function () {
    var el = document.getElementById('filtroViagens');
    if (!el) return;
    var p = Viagens.periodo;
    var anos = Viagens.anosDisponiveis();
    var html = '<div class="filtro-viagens">' +
      '<button class="fv-modo' + (p.modo === 'mes' ? ' sel' : '') + '" onclick="Viagens.setModo(\'mes\')">Mês</button>' +
      '<button class="fv-modo' + (p.modo === 'ano' ? ' sel' : '') + '" onclick="Viagens.setModo(\'ano\')">Ano</button>' +
      '<button class="fv-modo' + (p.modo === 'tudo' ? ' sel' : '') + '" onclick="Viagens.setModo(\'tudo\')">Tudo</button>' +
    '</div>';
    if (p.modo === 'mes') {
      var meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      html += '<div class="fv-nav">' +
        '<button onclick="Viagens.navMes(-1)"><span class="ms">chevron_left</span></button>' +
        '<select onchange="Viagens.setMes(this.value)">' +
          meses.map(function (m, i) { return '<option value="' + (i+1) + '"' + ((i+1)===p.mes?' selected':'') + '>' + m + '</option>'; }).join('') +
        '</select>' +
        '<select style="flex:0 0 110px" onchange="Viagens.setAno(this.value)">' +
          anos.map(function (a) { return '<option value="' + a + '"' + (String(a)===String(p.ano)?' selected':'') + '>' + a + '</option>'; }).join('') +
        '</select>' +
        '<button onclick="Viagens.navMes(1)"><span class="ms">chevron_right</span></button>' +
      '</div>';
    } else if (p.modo === 'ano') {
      html += '<div class="fv-nav">' +
        '<button onclick="Viagens.navAno(-1)"><span class="ms">chevron_left</span></button>' +
        '<select onchange="Viagens.setAno(this.value)">' +
          anos.map(function (a) { return '<option value="' + a + '"' + (String(a)===String(p.ano)?' selected':'') + '>' + a + '</option>'; }).join('') +
        '</select>' +
        '<button onclick="Viagens.navAno(1)"><span class="ms">chevron_right</span></button>' +
      '</div>';
    }
    el.innerHTML = html;
  },
  anosDisponiveis: function () {
    var set = {};
    Viagens.lista.forEach(function (v) { if (v.dataInicio) set[String(v.dataInicio).substring(0,4)] = 1; });
    set[String(new Date().getFullYear())] = 1;
    return Object.keys(set).sort().reverse();
  },
  setModo: function (m) { Viagens.periodo.modo = m; Viagens.renderFiltroPeriodo(); Viagens.renderChipsStatus(); Viagens.renderKpis(); Viagens.renderTudo(); },
  setMes: function (v) { Viagens.periodo.mes = parseInt(v,10); Viagens.renderChipsStatus(); Viagens.renderKpis(); Viagens.renderTudo(); },
  setAno: function (v) { Viagens.periodo.ano = parseInt(v,10); Viagens.renderFiltroPeriodo(); Viagens.renderChipsStatus(); Viagens.renderKpis(); Viagens.renderTudo(); },
  navMes: function (d) {
    Viagens.periodo.mes += d;
    if (Viagens.periodo.mes > 12) { Viagens.periodo.mes = 1; Viagens.periodo.ano++; }
    if (Viagens.periodo.mes < 1) { Viagens.periodo.mes = 12; Viagens.periodo.ano--; }
    Viagens.renderFiltroPeriodo(); Viagens.renderChipsStatus(); Viagens.renderKpis(); Viagens.renderTudo();
  },
  navAno: function (d) { Viagens.periodo.ano += d; Viagens.renderFiltroPeriodo(); Viagens.renderChipsStatus(); Viagens.renderKpis(); Viagens.renderTudo(); },
  _noPeriodo: function (v) {
    var modo = Viagens.periodo.modo;
    if (modo === 'tudo') return true;
    var ref = v.dataInicio || v.dataFim;
    if (!ref) return false;
    var s = String(ref).substring(0, 10);
    if (modo === 'ano') return s.substring(0, 4) === String(Viagens.periodo.ano);
    return s.substring(0, 7) === Viagens.periodo.ano + '-' + ('0' + Viagens.periodo.mes).slice(-2);
  },

  renderKpis: function () {
    var lista = Viagens.lista.filter(function (v) { return Viagens._noPeriodo(v); });
    var total = lista.length;
    var totalGasto = 0, emAndamento = 0, planejadas = 0;
    lista.forEach(function (v) {
      var t = Viagens.calcularTotais(v.id);
      totalGasto += t.total;
      if (v.status === 'andamento') emAndamento++;
      else if (v.status === 'planejada') planejadas++;
    });
    var html =
      '<div class="kpi-abast"><span class="ms">luggage</span><b>' + total + '</b><span class="lbl">Viagens</span></div>' +
      '<div class="kpi-abast amarelo"><span class="ms">directions_run</span><b>' + emAndamento + '</b><span class="lbl">Em curso</span></div>' +
      '<div class="kpi-abast"><span class="ms">schedule</span><b>' + planejadas + '</b><span class="lbl">Planejadas</span></div>' +
      '<div class="kpi-abast roxo"><span class="ms">payments</span><b>' + App.moeda(totalGasto) + '</b><span class="lbl">Total gasto</span></div>';
    var elKpis = document.getElementById('kpisViagens');
    if (elKpis) elKpis.innerHTML = html;
  },

  renderTudo: function () {
    var lista = Viagens.lista.filter(function (v) { return Viagens._noPeriodo(v); });
    if (Viagens.filtroStatus !== 'todos') {
      lista = lista.filter(function (v) { return v.status === Viagens.filtroStatus; });
    }
    var ordem = { andamento: 0, planejada: 1, concluida: 2 };
    lista.sort(function (a, b) {
      return (ordem[a.status] - ordem[b.status]) || String(b.dataInicio || '').localeCompare(String(a.dataInicio || ''));
    });

    var elPlanejadas = document.getElementById('blocoPlanejadas');
    if (elPlanejadas) { elPlanejadas.innerHTML = ''; elPlanejadas.classList.add('oculto'); }
    var elConcluidas = document.getElementById('blocoConcluidas');
    if (elConcluidas) { elConcluidas.innerHTML = ''; elConcluidas.classList.add('oculto'); }

    var elPrincipal = document.getElementById('blocoEmAndamento');
    if (!elPrincipal) return;

    if (!lista.length) {
      elPrincipal.innerHTML = '<div class="bloco-vazio">' +
        (Viagens.filtroStatus === 'todos' ? 'Nenhuma viagem neste período.' : 'Nenhuma viagem neste filtro.') +
      '</div>';
      Viagens.renderAcoesRodape();
      return;
    }
    elPrincipal.innerHTML = '<div class="lista-viagens">' + lista.map(Viagens.cardHTML).join('') + '</div>';
    Viagens.renderAcoesRodape();
  },

  renderAcoesRodape: function () {
    var el = document.getElementById('acoesTopoViagens') || document.getElementById('acoesViagensRodape');
    if (!el) return;
    el.style.cssText = 'display:flex;gap:10px;margin-bottom:14px';
    el.innerHTML =
      '<button class="btn-novo-sec" style="flex:1;justify-content:center" onclick="Viagens.abrirBuscaPostos()"><span class="ms" style="color:#ef4444">local_gas_station</span> Postos</button>' +
      '<button class="btn-novo-sec" style="flex:1;justify-content:center" onclick="Viagens.exportarPDF()"><span class="ms" style="color:#a78bfa">picture_as_pdf</span> Exportar PDF</button>';
  },

  exportarPDF: function () {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      App.toast('Biblioteca de PDF não carregada. Atualize a página (Ctrl+F5).', 'erro');
      return;
    }
    var lista = Viagens.lista.filter(function (v) { return Viagens._noPeriodo(v); });
    if (Viagens.filtroStatus !== 'todos') {
      lista = lista.filter(function (v) { return v.status === Viagens.filtroStatus; });
    }
    if (!lista.length) {
      App.toast('Nenhuma viagem para exportar neste filtro', 'erro');
      return;
    }
    lista.sort(function (a, b) { return String(b.dataInicio || '').localeCompare(String(a.dataInicio || '')); });

    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var totalGasto = 0;

    doc.setFontSize(16);
    doc.text('CarWay - Relatório de Viagens', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Organização: ' + ((typeof orgAtual !== 'undefined' && orgAtual && orgAtual.nome) || '-'), 14, 23);
    var rotuloStatus = { todos: 'Todos os status', andamento: 'Em andamento', planejada: 'Planejadas', concluida: 'Concluídas' }[Viagens.filtroStatus];
    doc.text('Filtro: ' + rotuloStatus + ' · Emitido em ' + Viagens.fmtData(App.hojeISO()), 14, 28);
    doc.setTextColor(0);

    var corpo = lista.map(function (v) {
      var t = Viagens.calcularTotais(v.id);
      totalGasto += t.total;
      var veic = Viagens.veiculos.filter(function (x) { return x.id === v.veiculoId; })[0];
      var status = { andamento: 'Em andamento', planejada: 'Planejada', concluida: 'Concluída' }[v.status] || v.status;
      var km = v.kmFinal > 0 ? (Number(v.kmFinal) - Number(v.kmInicial)) : Number(v.distancia) || 0;
      return [
        v.titulo || (v.origem + ' → ' + v.destino),
        veic ? veic.nome : '—',
        Viagens.fmtData(v.dataInicio) + (v.dataFim ? ' a ' + Viagens.fmtData(v.dataFim) : ''),
        status,
        App.fmtNum(km),
        App.moeda(t.total)
      ];
    });

    doc.autoTable({
      startY: 34,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      head: [['Viagem', 'Veículo', 'Período', 'Status', 'KM', 'Gasto total']],
      body: corpo
    });

    var y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.text('Resumo', 14, y);
    doc.autoTable({
      startY: y + 3,
      theme: 'grid',
      styles: { fontSize: 9 },
      head: [['Total de viagens', 'Gasto total']],
      body: [[String(lista.length), App.moeda(totalGasto)]]
    });

    var totalPaginas = doc.internal.getNumberOfPages();
    for (var i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('Página ' + i + ' de ' + totalPaginas, 196, 290, { align: 'right' });
    }

    Viagens._finalizarPDF(doc, 'carway-viagens-' + App.hojeISO() + '.pdf');
  },

  calcularTotais: function (viagemId) {
    var combustivel = 0, litros = 0, desp = 0, qtdDesp = 0, manut = 0, qtdManut = 0;
    Viagens.abastecimentos.forEach(function (a) {
      if (a.viagemId !== viagemId) return;
      var val = Number(a.valorTotal) || (Number(a.litros) || 0) * (Number(a.precoLitro) || 0);
      combustivel += val;
      litros += Number(a.litros) || 0;
    });
    Viagens.despesas.forEach(function (d) { if (d.viagemId === viagemId) { desp += Number(d.valor) || 0; qtdDesp++; } });
    Viagens.manutencoes.forEach(function (m) { if (m.viagemId === viagemId) { manut += Number(m.custo) || 0; qtdManut++; } });
    return {
      combustivel: Math.round(combustivel * 100) / 100,
      litros: Math.round(litros * 100) / 100,
      despesas: Math.round(desp * 100) / 100,
      qtdDespesas: qtdDesp,
      manutencoes: Math.round(manut * 100) / 100,
      qtdManutencoes: qtdManut,
      total: Math.round((combustivel + desp + manut) * 100) / 100
    };
  },
  precoMedioCombustivel: function (veiculoId) {
    var lista = (Viagens.abastecimentos || []).filter(function (a) {
      return a.veiculoId === veiculoId && Number(a.precoLitro) > 0;
    });
    lista.sort(function (a, b) { return String(b.data || '').localeCompare(String(a.data || '')); });
    var ultimos5 = lista.slice(0, 5);
    if (!ultimos5.length) return 0;
    var soma = 0;
    ultimos5.forEach(function (a) { soma += Number(a.precoLitro) || 0; });
    return Math.round((soma / ultimos5.length) * 100) / 100;
  },

  /* Card da lista: PLANEJADA agora tem Ver/Iniciar/Excluir sempre na
     MESMA LINHA (via flex explícito), em vez de a lixeira quebrar
     para uma linha própria. */
  cardHTML: function (v) {
    var veiculo = Viagens.veiculos.filter(function (x) { return x.id === v.veiculoId; })[0];
    var totais = Viagens.calcularTotais(v.id);
    var status = v.status || 'planejada';
    var labelStatus = { planejada: 'Planejada', andamento: 'Em curso', concluida: 'Concluída' }[status] || status;
    var icoStatus = { planejada: 'schedule', andamento: 'directions_run', concluida: 'check_circle' }[status] || 'schedule';
    var datas = Viagens.fmtData(v.dataInicio);
    if (v.dataFim) datas += ' → ' + Viagens.fmtData(v.dataFim);
    var tags = ['<span class="cv2-tag">' + labelStatus + '</span>'];
    if (String(v.idaVolta).toUpperCase() === 'SIM') tags.push('<span class="cv2-tag ida-volta"><span class="ms" style="font-size:13px">sync_alt</span>Ida e volta</span>');
    if (v.rota) tags.push('<span class="cv2-tag rota"><span class="ms" style="font-size:13px">map</span>Com rota</span>');
    var veicNome = veiculo ? veiculo.nome : 'Veículo';
    var veicPlaca = veiculo && veiculo.placa ? ' · ' + veiculo.placa : '';
    var km = v.kmFinal > 0 ? (Number(v.kmFinal) - Number(v.kmInicial)) : Number(v.distancia);
    var acoes = '';
    if (status === 'planejada') {
      acoes = '<div style="display:flex;gap:8px;width:100%">' +
        '<button class="pri" style="flex:1" onclick="App.irParaDetalheViagem(\'' + v.id + '\')"><span class="ms">visibility</span> Ver</button>' +
        '<button class="encerrar" style="flex:1" onclick="App.irParaEncerrarViagem(\'' + v.id + '\')"><span class="ms">play_arrow</span> Iniciar</button>' +
        '<button class="excluir" style="flex:0 0 46px;justify-content:center;padding:0" onclick="Viagens.excluir(\'' + v.id + '\')" title="Excluir"><span class="ms">delete</span></button>' +
      '</div>';
    } else if (status === 'andamento') {
      acoes = '<div style="display:flex;gap:8px;width:100%">' +
        '<button class="pri" style="flex:1" onclick="App.irParaDetalheViagem(\'' + v.id + '\')"><span class="ms">visibility</span> Ver</button>' +
        '<button class="encerrar" style="flex:1" onclick="App.irParaEncerrarViagem(\'' + v.id + '\')"><span class="ms">stop_circle</span> Encerrar</button>' +
      '</div>';
    } else {
      acoes = '<div style="display:flex;gap:8px;width:100%">' +
        '<button class="pri" style="flex:1" onclick="App.irParaDetalheViagem(\'' + v.id + '\')"><span class="ms">visibility</span> Ver</button>' +
        '<button class="excluir" style="flex:1" onclick="Viagens.excluir(\'' + v.id + '\')"><span class="ms">delete</span> Excluir</button>' +
      '</div>';
    }
    var corVeic = veiculo && App._corVeiculo ? App._corVeiculo(veiculo) : '#22d3ee';
    var icoVeic = veiculo && App._iconeTipoVeiculo ? App._iconeTipoVeiculo(veiculo.tipo) : 'directions_car';
    return '<div class="card-viagem ' + status + '">' +
      '<div class="cv2-topo">' +
        '<div class="cv2-icone" style="background:' + corVeic + '22;color:' + corVeic + '"><span class="ms">' + icoStatus + '</span></div>' +
        '<div class="cv2-info">' +
          '<b>' + App.esc(v.titulo || (v.origem + ' → ' + v.destino)) + '</b>' +
          '<small>' + App.esc(datas) + '</small>' +
          '<small style="display:flex;align-items:center;gap:4px;color:' + corVeic + '">' +
            '<span class="ms" style="font-size:14px">' + icoVeic + '</span>' + App.esc(veicNome + veicPlaca) +
          '</small>' +
        '</div>' +
        '<div class="cv2-valor">' + App.moeda(totais.total) + '<small>Total</small></div>' +
      '</div>' +
      '<div class="cv2-nums">' +
        '<div class="cv2-num"><b>' + App.fmtNum(km) + '</b><small>KM</small></div>' +
        '<div class="cv2-num"><b>' + totais.litros + ' L</b><small>Combustível</small></div>' +
        '<div class="cv2-num"><b>' + (totais.qtdDespesas + totais.qtdManutencoes) + '</b><small>Lançamentos</small></div>' +
      '</div>' +
      '<div class="cv2-tags">' + tags.join('') + '</div>' +
      '<div class="cv2-acoes">' + acoes + '</div>' +
    '</div>';
  },
  /* =========================================================
     FORMULÁRIO PLANEJADOR
     ========================================================= */
abrirPlanejador: function (idExistente) {
  App.fecharModal();

  Viagens._registrarListenerVeiculoGlobal();
    var precisaCarregar = Viagens.veiculos.length === 0;
    var carregar = precisaCarregar
      ? Promise.all([
          sb.from('veiculos').select('id, nome, placa, tanque, combustivel, tipo, cor').eq('organizacaoId', orgAtual.id).order('nome'),
          sb.from('abastecimentos').select('veiculoId, precoLitro, data').eq('organizacaoId', orgAtual.id)
        ]).then(function (rs) {
          Viagens.veiculos = rs[0].data || [];
          Viagens.abastecimentos = rs[1].data || [];
        })
      : Promise.resolve();
    carregar.then(function () {
      if (Viagens.veiculos.length === 0) {
        App.abrirModal('Veículo necessário',
          '<div style="text-align:center;padding:10px 0">' +
            '<span class="ms" style="font-size:56px;color:var(--txt2);opacity:0.5">directions_car</span>' +
            '<h3 style="margin:16px 0 10px">Cadastre um veículo primeiro</h3>' +
            '<p style="color:var(--txt2);font-size:14px;line-height:1.6;margin:0 0 20px">Para planejar viagens, você precisa cadastrar pelo menos um veículo.</p>' +
          '</div>',
          function () { App.fecharModal(); App.irParaFormVeiculo(); },
          'Cadastrar veículo'
        );
        return;
      }
      if (idExistente) {
        sb.from('viagens').select('*').eq('id', idExistente).single().then(function (r) {
          if (r.error || !r.data) { App.toast('Viagem não encontrada', 'erro'); return; }
          Viagens.editando = r.data;
          Viagens._modoEdicao = true;
          Viagens._origemOriginalTxt = r.data.origem || '';
          Viagens._destinoOriginalTxt = r.data.destino || '';
          Viagens._idaVoltaOriginal = String(r.data.idaVolta).toUpperCase() === 'SIM';
          Viagens.plano = {
            origem: r.data.origem ? { lat: 0, lon: 0, endereco: r.data.origem } : null,
            destino: r.data.destino ? { lat: 0, lon: 0, endereco: r.data.destino } : null,
            idaVolta: Viagens._idaVoltaOriginal,
            rotas: null, rotaAtiva: 0, paradasPorRota: {},
            veiculoSelecionado: null, parametrosAutonomia: null
          };
          if (r.data.rota) {
            try {
              var rotaSalva = JSON.parse(r.data.rota);
              Viagens.plano.origem = rotaSalva.origem || Viagens.plano.origem;
              Viagens.plano.destino = rotaSalva.destino || Viagens.plano.destino;
            } catch (e) {}
          }
          Viagens.renderPlanejador(r.data);
        });
      } else {
        Viagens.editando = null;
        Viagens._modoEdicao = false;
        Viagens.plano = {
          origem: null, destino: null, idaVolta: false,
          rotas: null, rotaAtiva: 0, paradasPorRota: {},
          veiculoSelecionado: null, parametrosAutonomia: null
        };
        Viagens.renderPlanejador(null);
      }
    });
  },
  renderPlanejador: function (viagemExistente) {
    var v = viagemExistente || {};
    var veiculos = Viagens.veiculos;
    var vSel = v.veiculoId || (App.veiculoAtivoId && veiculos.some(function(x){return x.id===App.veiculoAtivoId;}) ? App.veiculoAtivoId : veiculos[0].id);
    var veic = veiculos.filter(function (x) { return x.id === vSel; })[0] || veiculos[0];
    var veicOpts = veiculos.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === vSel ? ' selected' : '') + '>' +
        App.esc(x.nome) + (x.placa ? ' · ' + App.esc(x.placa) : '') + '</option>';
    }).join('');
    var precoMedio = Viagens.precoMedioCombustivel(vSel);
    var precoInicial = v.precoLitro || precoMedio || 6.29;
    var nivelSel = v.nivelPct || 100;
    var reservaSel = v.reservaPct || 15;
    var ehEdicao = Viagens._modoEdicao;

    var html =
      '<h2 class="form-titulo">' + (v.id ? 'Editar viagem' : 'Planejar viagem') + '</h2>' +
      Viagens._veiculoBlocoHTML(veic, 'cardVeicPlano') +
      '<div class="campo-form" style="margin-top:14px"><label>Veículo</label>' +
        '<select id="plVeiculo" onchange="Viagens.trocarVeiculoPlano()">' + veicOpts + '</select>' +
      '</div>' +
      '<div class="campo-form">' +
        '<label>Nome da viagem <small style="text-transform:none;color:var(--txt2);font-weight:400">(opcional)</small></label>' +
        '<input type="text" id="plNomeViagem" placeholder="' + App.esc((v.origem || '').split(',')[0] + (v.destino ? ' → ' + v.destino.split(',')[0] : '')) + '" value="' + App.esc(v.titulo || '') + '" maxlength="100">' +
      '</div>' +
      '<div class="campo-form">' +
        '<label>Saindo de</label>' +
        '<div class="campo-endereco-com-botoes">' +
          '<div class="campo-endereco">' +
            '<input type="text" id="plOrigem" placeholder="Cidade, endereço ou CEP" autocomplete="off" ' +
              'value="' + App.esc(v.origem || '') + '" ' +
              'oninput="Viagens.digitando(\'origem\')" ' +
              'onblur="Viagens.fecharSugestoesAtrasado(\'origem\')">' +
            '<span class="ms lupa">search</span>' +
            '<div class="sugestoes-lista" id="plSugOrigem"></div>' +
          '</div>' +
          '<button type="button" class="btn-icone-campo" onclick="Viagens.usarLocalizacao()" title="Usar minha localização">' +
            '<span class="ms" style="color:#22d3ee">my_location</span>' +
          '</button>' +
          '<button type="button" class="btn-icone-campo" onclick="Viagens.inverterOrdem()" title="Inverter origem e destino">' +
            '<span class="ms" style="color:#60a5fa">swap_vert</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="campo-form">' +
        '<label>Indo para</label>' +
        '<div class="campo-endereco-com-botoes">' +
          '<div class="campo-endereco">' +
            '<input type="text" id="plDestino" placeholder="Cidade, endereço ou CEP" autocomplete="off" ' +
              'value="' + App.esc(v.destino || '') + '" ' +
              'oninput="Viagens.digitando(\'destino\')" ' +
              'onblur="Viagens.fecharSugestoesAtrasado(\'destino\')">' +
            '<span class="ms lupa">search</span>' +
            '<div class="sugestoes-lista" id="plSugDestino"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="toggle-ida-volta">' +
        '<button type="button" class="iv-btn' + (!Viagens.plano.idaVolta ? ' sel' : '') + '" data-iv="0" onclick="Viagens.setIdaVolta(false)">' +
          '<span class="ms" style="color:#60a5fa">east</span><b>Só ida</b><small>trajeto simples</small></button>' +
        '<button type="button" class="iv-btn' + (Viagens.plano.idaVolta ? ' sel' : '') + '" data-iv="1" onclick="Viagens.setIdaVolta(true)">' +
          '<span class="ms" style="color:#a78bfa">sync_alt</span><b>Ida e volta</b><small>dobra o custo</small></button>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Consumo (km/L)</label>' +
          '<input type="number" id="plKmL" step="0.1" placeholder="11.5" value="' + (v.kmL || 11.5) + '" oninput="Viagens.previewAutonomia()">' +
        '</div>' +
        '<div class="campo-form"><label>Tanque (L)</label>' +
          '<input type="number" id="plTanque" step="0.5" placeholder="50" value="' + (v.tanque || veic.tanque || 50) + '" oninput="Viagens.previewAutonomia()">' +
        '</div>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Tanque agora</label>' +
          '<select id="plNivel" onchange="Viagens.previewAutonomia()">' +
            '<option value="100"' + (nivelSel === 100 ? ' selected' : '') + '>Cheio (100%)</option>' +
            '<option value="75"' + (nivelSel === 75 ? ' selected' : '') + '>3/4</option>' +
            '<option value="50"' + (nivelSel === 50 ? ' selected' : '') + '>Metade</option>' +
            '<option value="25"' + (nivelSel === 25 ? ' selected' : '') + '>1/4</option>' +
            '<option value="10"' + (nivelSel === 10 ? ' selected' : '') + '>Reserva</option>' +
          '</select>' +
        '</div>' +
        '<div class="campo-form"><label>Margem segurança</label>' +
          '<select id="plReserva" onchange="Viagens.previewAutonomia()">' +
            '<option value="10"' + (reservaSel === 10 ? ' selected' : '') + '>10% do tanque</option>' +
            '<option value="15"' + (reservaSel === 15 ? ' selected' : '') + '>15%</option>' +
            '<option value="20"' + (reservaSel === 20 ? ' selected' : '') + '>20%</option>' +
            '<option value="25"' + (reservaSel === 25 ? ' selected' : '') + '>25% (estrada isolada)</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="campo-form">' +
        '<label>Preço / L' + (precoMedio > 0 ? ' <small style="text-transform:none;color:var(--txt2);font-weight:400">(média dos últimos 5: ' + App.moeda(precoMedio) + ')</small>' : '') + '</label>' +
        '<input type="number" id="plPreco" step="0.01" placeholder="6,29" value="' + precoInicial + '">' +
      '</div>';

    if (ehEdicao) {
      html += '<h3 style="margin:18px 0 10px;font-size:12.5px;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px">Orçamento previsto</h3>' +
        '<div class="linha-2">' +
          '<div class="campo-form"><label>Alimentação</label><input type="number" id="plAlim" step="0.01" value="' + (v.alimentacaoPrev || '') + '"></div>' +
          '<div class="campo-form"><label>Hospedagem</label><input type="number" id="plHosp" step="0.01" value="' + (v.hospedagemPrev || '') + '"></div>' +
        '</div>' +
        '<div class="campo-form"><label>Outros gastos</label><input type="number" id="plOutros" step="0.01" value="' + (v.outrosPrev || '') + '"></div>' +
        '<div class="linha-2">' +
          '<div class="campo-form"><label>Data de saída</label><input type="date" id="plDataInicio" value="' + (v.dataInicio || '') + '"></div>' +
          '<div class="campo-form"><label>Data de retorno</label><input type="date" id="plDataFim" value="' + (v.dataFim || '') + '"></div>' +
        '</div>' +
        '<div class="campo-form"><label>KM do painel ao sair</label><input type="number" id="plKmInicialEdicao" value="' + (v.kmInicial || '') + '"></div>';
    }

    html += '<div class="resumo-autonomia" id="plResumoAut">' +
        '<div class="grid3">' +
          '<div><b>—</b><small>km tanque cheio</small></div>' +
          '<div><b>—</b><small>km agora</small></div>' +
          '<div><b>—</b><small>km entre paradas</small></div>' +
        '</div>' +
      '</div>';

    /* Disposição dos botões: Cancelar + Abrir no Maps na mesma linha,
       botão principal (Criar viagem / Salvar alterações) abaixo, em
       largura total — mesmo padrão usado em outras telas do app. */
    var acaoPrincipal = ehEdicao
      ? '<button class="btn-novo btn-bloco-full" id="btnSalvarEdicao" onclick="Viagens.salvarEdicaoInteligente(\'' + v.id + '\')"><span class="ms">check</span> Salvar alterações</button>'
      : '<button class="btn-novo btn-bloco-full" id="btnBuscarRotas" onclick="Viagens.buscarRotas()"><span class="ms">check</span> Criar viagem</button>';
    var acaoCancelar = ehEdicao
      ? '<button class="btn-cancelar-form" onclick="App.irParaDetalheViagem(\'' + v.id + '\')"><span class="ms">close</span> Cancelar</button>'
      : '<button class="btn-cancelar-form" onclick="App.irPara(\'viagens\')"><span class="ms">close</span> Cancelar</button>';

    html +=
      '<div class="form-acoes-viagem">' +
        '<div style="display:flex;gap:8px;width:100%">' +
          '<div style="flex:1">' + acaoCancelar + '</div>' +
          '<div style="flex:1"><button class="btn-novo-sec" style="width:100%;justify-content:center" onclick="Viagens.abrirNoMaps()"><span class="ms">navigation</span> Abrir no Maps</button></div>' +
        '</div>' +
        acaoPrincipal +
      '</div>';

    document.getElementById('formPlanoViagemContainer').innerHTML = html;
    Viagens.previewAutonomia();
  },
  trocarVeiculoPlano: function () {
    var sel = document.getElementById('plVeiculo');
    if (!sel) return;
    var veic = Viagens.veiculos.filter(function (x) { return x.id === sel.value; })[0];
    if (!veic) return;
    var card = document.getElementById('cardVeicPlano');
    if (card) card.outerHTML = Viagens._veiculoBlocoHTML(veic, 'cardVeicPlano');
    var tanque = document.getElementById('plTanque');
    if (tanque && veic.tanque) tanque.value = veic.tanque;
    var preco = document.getElementById('plPreco');
    var medio = Viagens.precoMedioCombustivel(veic.id);
    if (preco && medio > 0) preco.value = medio;
    Viagens.previewAutonomia();
  },
  inverterOrdem: function () {
    var inpO = document.getElementById('plOrigem');
    var inpD = document.getElementById('plDestino');
    if (!inpO || !inpD) return;
    var txtO = inpO.value;
    inpO.value = inpD.value;
    inpD.value = txtO;
    var o = Viagens.plano.origem;
    Viagens.plano.origem = Viagens.plano.destino;
    Viagens.plano.destino = o;
    App.toast('Origem e destino invertidos', 'ok');
  },
  setIdaVolta: function (v) {
    Viagens.plano.idaVolta = v;
    var botoes = document.querySelectorAll('.iv-btn');
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].classList.toggle('sel', botoes[i].getAttribute('data-iv') === (v ? '1' : '0'));
    }
  },
  previewAutonomia: function () {
    var el = document.getElementById('plResumoAut');
    if (!el) return;
    var kmL = Number(document.getElementById('plKmL').value) || 0;
    var tanque = Number(document.getElementById('plTanque').value) || 0;
    var nivel = Number(document.getElementById('plNivel').value) || 100;
    var reserva = Number(document.getElementById('plReserva').value) || 15;
    if (kmL <= 0 || tanque <= 0) {
      el.innerHTML = '<div class="grid3"><div><b>—</b><small>km tanque cheio</small></div><div><b>—</b><small>km agora</small></div><div><b>—</b><small>km entre paradas</small></div></div>';
      return;
    }
    var lReserva = tanque * (reserva / 100);
    var lUteis = tanque - lReserva;
    var lAgora = tanque * (nivel / 100);
    var autCheia = Math.round(kmL * tanque);
    var autUtil = Math.round(kmL * lUteis);
    var autIni = Math.round(kmL * Math.max(0, lAgora - lReserva));
    el.innerHTML = '<div class="grid3">' +
      '<div><b>' + autCheia + '</b><small>km tanque cheio</small></div>' +
      '<div><b>' + autIni + '</b><small>km agora (' + nivel + '%)</small></div>' +
      '<div><b>' + autUtil + '</b><small>km entre paradas</small></div>' +
    '</div>';
  },

  digitando: function (qual) {
    var input = document.getElementById(qual === 'origem' ? 'plOrigem' : 'plDestino');
    if (!input) return;
    var texto = input.value.trim();
    var st = Viagens._sug[qual];
    if (texto === st.ultimoTexto) return;
    clearTimeout(st.timer);
    if (texto.length < 3) { Viagens.esconderSugestoes(qual); return; }
    st.timer = setTimeout(function () { Viagens.buscarSugestoes(qual, texto); }, 600);
  },
  fecharSugestoesAtrasado: function (qual) {
    setTimeout(function () {
      var el = document.getElementById(qual === 'origem' ? 'plSugOrigem' : 'plSugDestino');
      if (el) el.classList.remove('aberto');
    }, 200);
  },
  buscarSugestoes: function (qual, texto) {
    var elId = qual === 'origem' ? 'plSugOrigem' : 'plSugDestino';
    var el = document.getElementById(elId);
    var input = document.getElementById(qual === 'origem' ? 'plOrigem' : 'plDestino');
    if (!el || !input) return;
    if (input.value.trim() !== texto) return;
    var st = Viagens._sug[qual];
    st.ultimoTexto = texto;
    var historico = Viagens.lerHistorico().filter(function (h) {
      return h.endereco.toLowerCase().indexOf(texto.toLowerCase()) > -1;
    });
    if (historico.length) {
      el.innerHTML = historico.map(function (h, idx) {
        return '<div class="sugestao-item" onmousedown="Viagens.escolherHistorico(\'' + qual + '\',' + idx + ')">' +
          '<span class="ms" style="font-size:18px;color:var(--azul2);vertical-align:middle;margin-right:6px">history</span>' +
          '<b>' + App.esc(h.endereco) + '</b></div>';
      }).join('') +
      '<div class="sugestao-item" style="opacity:.6;cursor:default;font-size:12px">' +
      '<i class="mini-loader" style="margin-right:6px"></i>Buscando mais endereços…</div>';
      el.classList.add('aberto');
    } else {
      el.innerHTML = '<div class="sugestao-item" style="cursor:default"><i class="mini-loader" style="margin-right:8px"></i>Buscando…</div>';
      el.classList.add('aberto');
    }
    Viagens.chamarGeocode({ endereco: texto })
      .then(function (resultados) {
        if (input.value.trim() !== texto) return;
        st.resultados = resultados;
        if (!resultados.length) {
          el.innerHTML = '<div class="sugestao-item" style="cursor:default;color:var(--txt2)">Nenhum endereço encontrado</div>';
          return;
        }
        el.innerHTML = resultados.slice(0, 5).map(function (r, idx) {
          var partes = r.endereco.split(',');
          var nome = partes[0] ? partes[0].trim() : r.endereco;
          var resto = partes.slice(1).join(',').trim();
          return '<div class="sugestao-item" onmousedown="Viagens.escolherSugestao(\'' + qual + '\',' + idx + ')">' +
            '<span class="ms" style="font-size:18px;color:var(--verde);vertical-align:middle;margin-right:6px">place</span>' +
            '<b>' + App.esc(nome) + '</b>' +
            (resto ? '<small>' + App.esc(resto) + '</small>' : '') +
          '</div>';
        }).join('');
      })
      .catch(function () {
        if (input.value.trim() !== texto) return;
        el.innerHTML = '<div class="sugestao-item" style="cursor:default;color:#fca5a5">Erro ao buscar</div>';
      });
  },
  escolherSugestao: function (qual, idx) {
    var st = Viagens._sug[qual];
    var r = st.resultados[idx];
    if (!r) return;
    var inputId = qual === 'origem' ? 'plOrigem' : 'plDestino';
    document.getElementById(inputId).value = r.endereco;
    Viagens.plano[qual] = { lat: r.lat, lon: r.lon, endereco: r.endereco };
    Viagens.gravarHistorico(r.endereco);
    Viagens.esconderSugestoes(qual);
  },
  escolherHistorico: function (qual, idx) {
    var input = document.getElementById(qual === 'origem' ? 'plOrigem' : 'plDestino');
    var lista = Viagens.lerHistorico().filter(function (h) {
      return input && h.endereco.toLowerCase().indexOf(input.value.toLowerCase()) > -1;
    });
    var h = lista[idx];
    if (!h) return;
    document.getElementById(qual === 'origem' ? 'plOrigem' : 'plDestino').value = h.endereco;
    Viagens.chamarGeocode({ endereco: h.endereco })
      .then(function (rs) {
        if (rs.length) Viagens.plano[qual] = { lat: rs[0].lat, lon: rs[0].lon, endereco: rs[0].endereco };
      })
      .catch(function () {});
    Viagens.esconderSugestoes(qual);
  },
  esconderSugestoes: function (qual) {
    var el = document.getElementById(qual === 'origem' ? 'plSugOrigem' : 'plSugDestino');
    if (el) { el.classList.remove('aberto'); el.innerHTML = ''; }
    Viagens._sug[qual].ultimoTexto = '';
  },
  usarLocalizacao: function () {
    if (!navigator.geolocation) { App.toast('GPS indisponível', 'erro'); return; }
    var input = document.getElementById('plOrigem');
    input.value = 'Obtendo localização...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      Viagens.chamarGeocode({ latlng: lat + ',' + lon })
        .then(function (resultados) {
          var endereco = 'Localização atual';
          if (resultados.length) endereco = resultados[0].endereco;
          input.value = endereco;
          Viagens.plano.origem = { lat: lat, lon: lon, endereco: endereco };
          Viagens.gravarHistorico(endereco);
        })
        .catch(function () {
          input.value = 'Localização atual';
          Viagens.plano.origem = { lat: lat, lon: lon, endereco: 'Localização atual' };
        });
    }, function () {
      input.value = '';
      App.toast('Não foi possível obter a localização', 'erro');
    }, { enableHighAccuracy: true, timeout: 15000 });
  },
  /* =========================================================
     ABRIR NO MAPS (sem salvar)
     ========================================================= */
  abrirNoMaps: function () {
    var origemInput = document.getElementById('plOrigem');
    var destinoInput = document.getElementById('plDestino');
    if (!origemInput || !destinoInput) return;
    var textoOrigem = origemInput.value.trim();
    var textoDestino = destinoInput.value.trim();
    if (!textoOrigem && !textoDestino) { App.toast('Informe origem e destino', 'erro'); origemInput.focus(); return; }
    if (!textoOrigem) { App.toast('Informe a origem', 'erro'); origemInput.focus(); return; }
    if (!textoDestino) { App.toast('Informe o destino', 'erro'); destinoInput.focus(); return; }
    if (textoOrigem === textoDestino) { App.toast('Origem e destino são iguais', 'erro'); return; }
    var origem = Viagens.plano.origem;
    var destino = Viagens.plano.destino;
    var temOrigemCoord = origem && origem.lat && origem.lon && origem.endereco === textoOrigem;
    var temDestinoCoord = destino && destino.lat && destino.lon && destino.endereco === textoDestino;
    if (!temOrigemCoord || !temDestinoCoord) {
      var promessas = [];
      if (!temOrigemCoord) {
        promessas.push(Viagens.chamarGeocode({ endereco: textoOrigem }).then(function (rs) {
          if (rs.length) { Viagens.plano.origem = { lat: rs[0].lat, lon: rs[0].lon, endereco: rs[0].endereco }; origemInput.value = rs[0].endereco; }
        }));
      }
      if (!temDestinoCoord) {
        promessas.push(Viagens.chamarGeocode({ endereco: textoDestino }).then(function (rs) {
          if (rs.length) { Viagens.plano.destino = { lat: rs[0].lat, lon: rs[0].lon, endereco: rs[0].endereco }; destinoInput.value = rs[0].endereco; }
        }));
      }
      var btn = event && event.target ? event.target.closest('button') : null;
      if (btn) btn.disabled = true;
      Promise.all(promessas)
        .then(function () { if (btn) btn.disabled = false; Viagens._continuarAbrirNoMaps(); })
        .catch(function (e) { if (btn) btn.disabled = false; App.toast(e.message || 'Erro ao buscar endereço', 'erro'); });
      return;
    }
    Viagens._continuarAbrirNoMaps();
  },
  _continuarAbrirNoMaps: function () {
  var origem = Viagens.plano.origem;
  var destino = Viagens.plano.destino;

  if (!origem || !origem.lat || !destino || !destino.lat) {
    App.toast('Não foi possível localizar os endereços', 'erro');
    return;
  }

  var preferido = '';

  if (usuarioAtual) {
    preferido = String(usuarioAtual.appNavegacaoPreferido || usuarioAtual.appNavegacaoPadrao || '').trim();
  }

  if (preferido === 'google_maps') preferido = 'google';

  if (preferido && preferido !== 'perguntar') {
    Viagens.abrirAppNavegacao(preferido, origem, destino, false);
    return;
  }

  Viagens.mostrarModalNavegacao();
},
  mostrarModalNavegacao: function () {
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  var apps = [
    { id: 'google', nome: 'Google Maps', ico: 'map', cor: '#4285F4', sub: 'Rota completa com origem e destino' },
    { id: 'waze', nome: 'Waze', ico: 'assistant_navigation', cor: '#33CCFF', sub: 'Navegação a partir de onde você está' },
    { id: 'uber', nome: 'Uber', ico: 'local_taxi', cor: '#22c55e', sub: 'Pedir corrida até o destino' }
  ];

  if (isIOS) {
    apps.splice(2, 0, { id: 'apple', nome: 'Apple Maps', ico: 'map', cor: '#007AFF', sub: 'Integrado ao iPhone' });
  }

  var html =
    '<div class="aviso info" style="margin-bottom:16px">' +
      '<span class="ms">navigation</span>' +
      '<div><b>Como você quer ir?</b>Escolha o aplicativo desta vez.</div>' +
    '</div>' +
    '<div class="apps-nav">' +
      apps.map(function (a) {
        return '<button class="app-nav-item" onclick="Viagens.escolherAppNavegacao(\'' + a.id + '\')">' +
          '<span class="ms" style="color:' + a.cor + '">' + a.ico + '</span>' +
          '<b>' + a.nome + '</b>' +
          '<small>' + a.sub + '</small>' +
        '</button>';
      }).join('') +
    '</div>' +
    '<label class="switch" style="margin-top:16px">' +
      '<span>Usar sempre este app</span>' +
      '<input type="checkbox" id="lembrarApp">' +
    '</label>' +
    '<small style="display:block;margin-top:8px;color:var(--txt2);font-size:11.5px;line-height:1.5">' +
      'Se marcar, a escolha fica salva em Configurações e o app abre direto nas próximas viagens.' +
    '</small>';

  App.abrirModal('Abrir no Maps', html, null);
},
escolherAppNavegacao: function (app) {
  var lembrar = document.getElementById('lembrarApp');
  var salvar = lembrar ? lembrar.checked : false;

  App.fecharModal();

  if (salvar && usuarioAtual && usuarioAtual.id) {
    var valorSalvo = app === 'google' ? 'google_maps' : app;

    sb.from('usuarios').update({ appNavegacaoPreferido: valorSalvo }).eq('id', usuarioAtual.id).then(function () {
      usuarioAtual.appNavegacaoPreferido = valorSalvo;
      App.toast('Preferência salva em Configurações', 'ok');
    }).catch(function () {});
  }

  Viagens.abrirAppNavegacao(app, Viagens.plano.origem, Viagens.plano.destino, false);
},
 abrirAppNavegacao: function (app, origem, destino, silencioso) {
  if (!origem || !destino) return;

  var lat = destino.lat;
  var lon = destino.lon;

  if (!silencioso) App.toast('Abrindo ' + Viagens.nomeApp(app) + '...', 'ok');

  if (app === 'waze') {
    Viagens._paradasParaNavegacao = null;
    window.location.href = 'https://www.waze.com/ul?ll=' + lat + '%2C' + lon + '&navigate=yes&zoom=17';
    return;
  }

  if (app === 'uber') {
    Viagens._paradasParaNavegacao = null;
    window.location.href = 'https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=' + lat + '&dropoff[longitude]=' + lon;
    return;
  }

  var url = '';

  if (app === 'apple') {
    url = 'https://maps.apple.com/?saddr=' + origem.lat + ',' + origem.lon + '&daddr=' + lat + ',' + lon + '&dirflg=d';
  } else {
    url = Viagens._urlMapsComParadas(origem, destino);
  }

  Viagens._paradasParaNavegacao = null;
  window.open(url, '_blank', 'noopener');
},
nomeApp: function (app) {
  return ({ google: 'Google Maps', google_maps: 'Google Maps', waze: 'Waze', apple: 'Apple Maps', uber: 'Uber' })[app] || 'app';
},

   voltarParaFormularioMantendoRotas: function () {
  var v = (Viagens._modoEdicao && Viagens.editando) ? Viagens.editando : {};

  if (!Viagens.veiculos.length) {
    Viagens.abrirPlanejador(v.id || null);
    return;
  }

  Viagens.renderPlanejador(Viagens._modoEdicao ? Viagens.editando : null);

  var inpOrigem = document.getElementById('plOrigem');
  var inpDestino = document.getElementById('plDestino');

  if (inpOrigem && Viagens.plano.origem) inpOrigem.value = Viagens.plano.origem.endereco || '';
  if (inpDestino && Viagens.plano.destino) inpDestino.value = Viagens.plano.destino.endereco || '';

  Viagens.setIdaVolta(Viagens.plano.idaVolta);

  var p = Viagens.plano.parametrosAutonomia;

  if (p) {
    var elKmL = document.getElementById('plKmL');
    var elTanque = document.getElementById('plTanque');
    var elNivel = document.getElementById('plNivel');
    var elReserva = document.getElementById('plReserva');
    var elPreco = document.getElementById('plPreco');

    if (elKmL) elKmL.value = p.kmL;
    if (elTanque) elTanque.value = p.tanque;
    if (elNivel) elNivel.value = p.nivel;
    if (elReserva) elReserva.value = p.reserva;
    if (elPreco) elPreco.value = p.preco;
  }

  if (Viagens.plano.veiculoSelecionado) {
    var selVeic = document.getElementById('plVeiculo');
    if (selVeic) selVeic.value = Viagens.plano.veiculoSelecionado.id;
  }

  Viagens.previewAutonomia();

  if (Viagens.plano.rotas && Viagens.plano.rotas.length) {
    var container = document.getElementById('formPlanoViagemContainer');

    if (container) {
      var aviso = document.createElement('div');

      aviso.style.cssText = 'background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);border-radius:12px;padding:11px 13px;margin-bottom:14px;font-size:12.5px;color:#86efac;display:flex;align-items:center;gap:10px';

      aviso.innerHTML = '<span class="ms" style="font-size:18px">route</span>' +
        '<div style="flex:1;min-width:0"><b>Busca anterior preservada</b><br>' +
        Viagens.plano.rotas.length + ' rota(s) já encontrada(s). Você não paga nova consulta.</div>' +
        '<button class="btn-novo-sec" style="flex:none;padding:8px 12px;font-size:12px" onclick="Viagens.mostrarRotas()">Ver rotas</button>';

      container.insertBefore(aviso, container.firstChild);
    }
  }
},
   _htmlCabecalhoRota: function (origemTxt, destinoTxt, idaVolta) {
  var origemCurta = String(origemTxt || '').split(',').slice(0, 2).join(',').trim();
  var destinoCurta = String(destinoTxt || '').split(',').slice(0, 2).join(',').trim();

  return '<div class="rota-cabecalho">' +
    '<div class="rc-ponto">' +
      '<span class="ms" style="color:#22c55e">trip_origin</span>' +
      '<div><small>Saindo de</small><b>' + App.esc(origemCurta) + '</b></div>' +
    '</div>' +
    '<div class="rc-traco"></div>' +
    '<div class="rc-ponto">' +
      '<span class="ms" style="color:#ef4444">place</span>' +
      '<div><small>Indo para</small><b>' + App.esc(destinoCurta) + '</b></div>' +
    '</div>' +
    '<div class="rc-rodape">' +
      '<span class="ms">' + (idaVolta ? 'sync_alt' : 'east') + '</span>' +
      '<div>' + (idaVolta
        ? '<b style="color:var(--txt)">Ida e volta.</b> Distância, combustível e pedágio já incluem o retorno.'
        : '<b style="color:var(--txt)">Somente ida.</b> Os valores consideram apenas o trajeto de ida.') +
      '</div>' +
    '</div>' +
  '</div>';
},
  /* =========================================================
     EDIÇÃO INTELIGENTE — decide se precisa refazer a busca paga
     ========================================================= */
  salvarEdicaoInteligente: function (viagemId) {
    var origemInput = document.getElementById('plOrigem');
    var destinoInput = document.getElementById('plDestino');
    var textoOrigem = origemInput.value.trim();
    var textoDestino = destinoInput.value.trim();
    var idaVoltaAtual = Viagens.plano.idaVolta;

    var mudouLocalizacao = (textoOrigem !== Viagens._origemOriginalTxt) ||
      (textoDestino !== Viagens._destinoOriginalTxt) ||
      (idaVoltaAtual !== Viagens._idaVoltaOriginal);

    if (!mudouLocalizacao) {
      Viagens._salvarEdicaoSemNovaRota(viagemId);
      return;
    }

    App.confirmar({
      titulo: 'Refazer busca de rota?',
      mensagem: 'Você alterou a origem, o destino ou o tipo de percurso. ' +
        'Isso exige uma NOVA busca de rota (usa a API do Google Maps). ' +
        'Deseja continuar?',
      textoBotao: 'Buscar nova rota',
      tipo: 'aviso',
      icone: 'route',
      aoConfirmar: function () {
        Viagens.plano.rotas = null;
        Viagens.plano.paradasPorRota = {};
        Viagens.buscarRotas();
      }
    });
  },
  _salvarEdicaoSemNovaRota: function (viagemId) {
    var v = Viagens.editando || {};
    var kmL = Number(document.getElementById('plKmL').value) || 0;
    var preco = Number(document.getElementById('plPreco').value) || 0;
    var distancia = Number(v.distancia) || 0;
    var novoCombPrev = (kmL > 0 && distancia > 0) ? Math.round((distancia / kmL) * preco * 100) / 100 : (v.combustivelPrev || 0);

    var alim = document.getElementById('plAlim') ? Number(document.getElementById('plAlim').value) || 0 : (v.alimentacaoPrev || 0);
    var hosp = document.getElementById('plHosp') ? Number(document.getElementById('plHosp').value) || 0 : (v.hospedagemPrev || 0);
    var outros = document.getElementById('plOutros') ? Number(document.getElementById('plOutros').value) || 0 : (v.outrosPrev || 0);
    var pedagio = Number(v.pedagioPrev) || 0;

    var reg = {
      veiculoId: document.getElementById('plVeiculo').value,
      titulo: document.getElementById('plNomeViagem').value.trim() || v.titulo,
      kmL: kmL,
      precoLitro: preco,
      combustivelPrev: novoCombPrev,
      alimentacaoPrev: alim,
      hospedagemPrev: hosp,
      outrosPrev: outros,
      totalPrev: Math.round((novoCombPrev + pedagio + alim + hosp + outros) * 100) / 100
    };
    var dataInicioEl = document.getElementById('plDataInicio');
    var dataFimEl = document.getElementById('plDataFim');
    var kmInicialEl = document.getElementById('plKmInicialEdicao');
    if (dataInicioEl) reg.dataInicio = dataInicioEl.value;
    if (dataFimEl) reg.dataFim = dataFimEl.value || null;
    if (kmInicialEl) reg.kmInicial = Number(kmInicialEl.value) || 0;

    var btn = document.getElementById('btnSalvarEdicao');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    sb.from('viagens').update(reg).eq('id', viagemId).then(function (r) {
      if (r.error) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="ms">check</span> Salvar alterações'; }
        App.toast('Erro: ' + r.error.message, 'erro');
        return;
      }
      App.toast('Alterações salvas! (sem custo de nova busca)', 'ok');
      App.irParaDetalheViagem(viagemId);
    });
  },

  /* =========================================================
     BUSCAR ROTAS
     ========================================================= */
  buscarRotas: function () {
    var origem = Viagens.plano.origem;
    var destino = Viagens.plano.destino;
    if (!origem || !origem.lat) {
      var txtOrig = document.getElementById('plOrigem').value.trim();
      if (!txtOrig) { App.toast('Informe a origem', 'erro'); return; }
      return Viagens._geocodificarAntesDeRotas('origem', txtOrig);
    }
    if (!destino || !destino.lat) {
      var txtDest = document.getElementById('plDestino').value.trim();
      if (!txtDest) { App.toast('Informe o destino', 'erro'); return; }
      return Viagens._geocodificarAntesDeRotas('destino', txtDest);
    }
    var veicId = document.getElementById('plVeiculo').value;
    var veic = Viagens.veiculos.filter(function (x) { return x.id === veicId; })[0];
    var kmL = Number(document.getElementById('plKmL').value) || 0;
    var tanque = Number(document.getElementById('plTanque').value) || 0;
    if (kmL <= 0) { App.toast('Informe o consumo (km/L)', 'erro'); return; }
    if (tanque <= 0) { App.toast('Informe a capacidade do tanque', 'erro'); return; }
    var nivel = Number(document.getElementById('plNivel').value) || 100;
    var reserva = Number(document.getElementById('plReserva').value) || 15;
    var preco = Number(document.getElementById('plPreco').value) || 0;

    Viagens.plano.veiculoSelecionado = veic;
    Viagens.plano.parametrosAutonomia = { kmL: kmL, tanque: tanque, nivel: nivel, reserva: reserva, preco: preco };

    var comb = String(veic.combustivel || 'Gasolina').toUpperCase();
    var emissionType = 'GASOLINE';
    if (comb.indexOf('DIESEL') > -1) emissionType = 'DIESEL';
    else if (comb.indexOf('ELETR') > -1) emissionType = 'ELECTRIC';
    else if (comb.indexOf('HIBR') > -1) emissionType = 'HYBRID';
    var btn = document.getElementById('btnBuscarRotas') || document.getElementById('btnSalvarEdicao');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ms">hourglass_top</span> Buscando rotas...'; }
    Viagens.chamarRoutes(origem, destino, Viagens.plano.idaVolta, emissionType)
      .then(function (rotas) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="ms">check</span> Criar viagem'; }
        if (!rotas.length) { App.toast('Nenhuma rota encontrada', 'erro'); return; }
              var custoPorKm = 1 / kmL;
        rotas.forEach(function (r) {
          var litros = r.km * custoPorKm;
          r.litros = Math.round(litros * 100) / 100;
          r.custoCombustivel = Math.round(litros * preco * 100) / 100;
          r.custoPedagio = r.custoPedagio || 0;
          r.custoTotal = Math.round((r.custoCombustivel + r.custoPedagio) * 100) / 100;
        });
        var iMaisRapida = 0, iMaisEconomica = 0;
        for (var i = 1; i < rotas.length; i++) {
          if (rotas[i].minutos < rotas[iMaisRapida].minutos) iMaisRapida = i;
          if (rotas[i].custoTotal < rotas[iMaisEconomica].custoTotal) iMaisEconomica = i;
        }
        rotas[iMaisRapida].seloRapida = true;
        rotas[iMaisEconomica].seloEconomica = true;
        Viagens.plano.rotas = rotas;
        Viagens.plano.paradasPorRota = {};
        Viagens.calcularEMostrarRota(iMaisRapida);
      })
      .catch(function (e) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="ms">check</span> Criar viagem'; }
        App.toast(e.message || 'Erro ao buscar rotas', 'erro');
      });
  },

   calcularEMostrarRota: function (idx) {
    Viagens.plano.rotaAtiva = idx;
    if (Viagens.plano.paradasPorRota[idx]) {
      Viagens.mostrarRotas();
      return;
    }
    Viagens.mostrarRotas(true);
    var rota = Viagens.plano.rotas[idx];
    if (!rota) { Viagens.mostrarRotas(); return; }
    Viagens.planejarParadasSequencial(rota).then(function (paradas) {
      return Viagens.verificarManutencao(Viagens.plano.veiculoSelecionado.id, rota.km)
        .then(function (manut) {
          Viagens.plano.paradasPorRota[idx] = { paradas: paradas, manutencao: manut };
          Viagens.mostrarRotas();
        })
        .catch(function (e) {
          console.warn('Erro em manutenção (rota e paradas preservadas):', e);
          Viagens.plano.paradasPorRota[idx] = { paradas: paradas, manutencao: null, erroParcial: true };
          Viagens.mostrarRotas();
          App.toast('Não foi possível verificar as revisões. A rota foi mantida.', 'ok');
        });
    }).catch(function (e) {
      console.error('CarWay - erro ao planejar paradas:', e);
      Viagens.plano.paradasPorRota[idx] = { paradas: [], manutencao: null, erroParcial: true };
      Viagens.mostrarRotas();
      App.toast('Ocorreu um erro ao calcular as paradas. A rota foi mantida.', 'erro');
    });
  },

  selecionarRotaPreview: function (idx) {
    if (idx === Viagens.plano.rotaAtiva) return;
    Viagens.calcularEMostrarRota(idx);
  },
  _cliqueCardRota: function (e, idx) {
    Viagens.selecionarRotaPreview(idx);
  },

  calcularParadas: function (kmTotal, kmSo, idaVolta, kmL, tanque, nivelPct, reservaPct) {
    var lReserva = tanque * (reservaPct / 100);
    var lUteis = tanque - lReserva;
    var lAgora = tanque * (nivelPct / 100);
    var autInicial = kmL * Math.max(0, lAgora - lReserva);
    var autUtil = kmL * lUteis;
    var paradas = [];
    var pos = autInicial;
    var guard = 0;
    if (kmTotal <= autInicial) return [];
    while (pos < kmTotal - 1 && guard < 40) {
      guard++;
      var trecho = 'IDA';
      var kmNoTrecho = pos;
      if (idaVolta && pos > kmSo) {
        trecho = 'VOLTA';
        kmNoTrecho = pos - kmSo;
      }
      var kmAteFim = kmTotal - pos;
      var litros = lUteis;
      var ultima = 0;
      if (kmAteFim < autUtil) {
        litros = (kmAteFim / kmL) * 1.15;
        ultima = 1;
      }
      paradas.push({
        ordem: paradas.length + 1,
        kmAcum: Math.round(pos * 10) / 10,
        kmNoTrecho: Math.round(kmNoTrecho * 10) / 10,
        trecho: trecho,
        litrosPrevisto: Math.round(litros * 10) / 10,
        ultimaParada: ultima,
        postoNome: '', postoEndereco: '', postoRating: 0,
        postoLat: 0, postoLon: 0, postoDesvioKm: 0, postoPlaceId: '',
        semPosto: 0, lat: 0, lon: 0,
        antecipada: false, kmOriginalPrevisto: 0, kmAntecipadoEm: 0
      });
      pos += autUtil;
    }
    return paradas;
  },

     planejarParadasSequencial: function (rota) {
    var p = Viagens.plano.parametrosAutonomia;
    var idaVolta = Viagens.plano.idaVolta;
    var kmTotal = Number(rota.km) || 0;
    var kmSo = Number(rota.kmIda) || kmTotal;
    var lReserva = p.tanque * (p.reserva / 100);
    var lUteis = p.tanque - lReserva;
    var lAgora = p.tanque * (p.nivel / 100);
    var autInicial = p.kmL * Math.max(0, lAgora - lReserva);
    var autUtil = p.kmL * lUteis;
    if (kmTotal <= autInicial) return Promise.resolve([]);
    var coords = rota.polyline ? Viagens._decodificarPolyline(rota.polyline) : [];
    if (!coords.length || autUtil <= 0) {
      return Promise.resolve(Viagens.calcularParadas(kmTotal, kmSo, idaVolta, p.kmL, p.tanque, p.nivel, p.reserva));
    }
    var paradas = [];
    var posAnterior = 0;
    var alcance = autInicial;
    var guarda = 0;
    function proxima() {
      guarda++;
      if (guarda > 40) return Promise.resolve(paradas);
      var kmIdeal = posAnterior + alcance;
      if (kmIdeal >= kmTotal - 1) return Promise.resolve(paradas);
      return Viagens._encontrarPostoParaPosicao(kmIdeal, posAnterior + 1, coords, kmSo, idaVolta).then(function (res) {
        var kmReal = Math.round(res.km * 10) / 10;
        var kmPercorrido = kmReal - posAnterior;
        var kmAteFim = kmTotal - kmReal;
        var litrosEncher = (paradas.length === 0)
          ? p.tanque - Math.max(0, lAgora - (kmPercorrido / p.kmL))
          : kmPercorrido / p.kmL;
        var litrosAteFim = kmAteFim / p.kmL;
        var ultima = litrosAteFim <= litrosEncher;
        var litros = ultima ? litrosAteFim : litrosEncher;
        var trecho = 'IDA';
        var kmNoTrecho = kmReal;
        if (idaVolta && kmReal > kmSo) { trecho = 'VOLTA'; kmNoTrecho = kmReal - kmSo; }
        var parada = {
          ordem: paradas.length + 1,
          kmAcum: kmReal,
          kmNoTrecho: Math.round(kmNoTrecho * 10) / 10,
          trecho: trecho,
          litrosPrevisto: Math.round(Math.max(0, litros) * 10) / 10,
          ultimaParada: ultima ? 1 : 0,
          postoNome: '', postoEndereco: '', postoRating: 0,
          postoLat: 0, postoLon: 0, postoDesvioKm: 0, postoPlaceId: '',
          semPosto: res.semPosto ? 1 : 0,
          lat: res.pos ? res.pos[0] : 0,
          lon: res.pos ? res.pos[1] : 0,
          antecipada: !!res.antecipada,
          kmOriginalPrevisto: res.antecipada ? Math.round(res.kmOriginal * 10) / 10 : 0,
          kmAntecipadoEm: res.antecipada ? Math.round((res.kmOriginal - res.km) * 10) / 10 : 0
        };
        if (res.locais && res.locais.length) Viagens._aplicarPostoEncontrado(parada, res.locais);
        paradas.push(parada);
        if (ultima) return paradas;
        posAnterior = kmReal;
        alcance = autUtil;
        return proxima();
      });
    }
    return proxima();
  },

  _encontrarPostoParaPosicao: function (kmIdeal, limiteInferior, coords, kmSo, idaVolta) {
    var PASSO_KM = 20;
    var MAX_TENTATIVAS = 8;
    var tentativa = 0;
    function buscar(km, raio) {
      var pos = Viagens._posicaoNaLinha(coords, km, kmSo, idaVolta);
      if (!pos) return Promise.resolve(null);
      return Viagens.chamarPlaces(pos[0], pos[1], raio, 5, 'gas_station').then(function (locais) {
        if (locais && locais.length) return { km: km, pos: pos, locais: locais };
        return null;
      }).catch(function () { return null; });
    }
    function recuar() {
      tentativa++;
      var novoKm = kmIdeal - (PASSO_KM * tentativa);
      if (novoKm < limiteInferior || tentativa > MAX_TENTATIVAS) {
        return Promise.resolve({ km: kmIdeal, pos: Viagens._posicaoNaLinha(coords, kmIdeal, kmSo, idaVolta), locais: [], antecipada: false, semPosto: true });
      }
      return buscar(novoKm, 12000).then(function (r) {
        if (r) return { km: r.km, pos: r.pos, locais: r.locais, antecipada: true, kmOriginal: kmIdeal, semPosto: false };
        return recuar();
      });
    }
    return buscar(kmIdeal, 8000).then(function (r1) {
      if (r1) return { km: r1.km, pos: r1.pos, locais: r1.locais, antecipada: false, semPosto: false };
      return buscar(kmIdeal, 25000).then(function (r2) {
        if (r2) return { km: r2.km, pos: r2.pos, locais: r2.locais, antecipada: false, semPosto: false };
        return recuar();
      });
    });
  },
  buscarPostosParaParadasDaRota: function (paradas, rota) {
    if (!paradas || !paradas.length) return Promise.resolve();
    var coords = rota.polyline ? Viagens._decodificarPolyline(rota.polyline) : [];
    if (!coords.length) return Promise.resolve();
    var kmSo = rota.kmIda;
    var idaVolta = Viagens.plano.idaVolta;

    paradas.forEach(function (p) {
      var pos = Viagens._posicaoNaLinha(coords, p.kmAcum, kmSo, idaVolta);
      if (pos) { p.lat = pos[0]; p.lon = pos[1]; }
    });

    function processarEmLotes(lista, tamanhoLote, funcao) {
      function proximoLote(indice) {
        if (indice >= lista.length) return Promise.resolve();
        var lote = lista.slice(indice, indice + tamanhoLote);
        return Promise.all(lote.map(funcao)).then(function () {
          return proximoLote(indice + tamanhoLote);
        });
      }
      return proximoLote(0);
    }

    function tentarPontoIdeal(p) {
      return Viagens.chamarPlaces(p.lat, p.lon, 8000, 5, 'gas_station').then(function (locais) {
        if (locais.length) { Viagens._aplicarPostoEncontrado(p, locais); }
        return null;
      }).catch(function () { return null; });
    }

    return processarEmLotes(paradas, 5, tentarPontoIdeal).then(function () {
      var falharam1 = paradas.filter(function (p) { return !p.postoNome; });
      if (!falharam1.length) return;
      function tentarRaioMaior(p) {
        return Viagens.chamarPlaces(p.lat, p.lon, 25000, 5, 'gas_station').then(function (locais) {
          if (locais.length) { Viagens._aplicarPostoEncontrado(p, locais); }
          return null;
        }).catch(function () { return null; });
      }
      return processarEmLotes(falharam1, 5, tentarRaioMaior);
    }).then(function () {
      var falharam2 = paradas.filter(function (p) { return !p.postoNome; });
      if (!falharam2.length) return;
      return Promise.all(falharam2.map(function (p) {
        var idx = paradas.indexOf(p);
        var limiteInferior;
        if (idx > 0) {
          limiteInferior = paradas[idx - 1].kmAcum;
        } else {
          limiteInferior = (p.trecho === 'VOLTA') ? kmSo : 0;
        }
        return Viagens._buscarPostoRetroativo(p, coords, kmSo, idaVolta, limiteInferior);
      }));
    });
  },

  _aplicarPostoEncontrado: function (p, locais) {
    var confiaveis = locais.filter(function (x) { return x.avaliacoes >= 5 && x.rating >= 3.5; });
    var escolhido = (confiaveis.length ? confiaveis : locais)[0];
    p.postoNome = escolhido.nome;
    p.postoEndereco = escolhido.endereco;
    p.postoRating = escolhido.rating;
    p.postoLat = escolhido.lat;
    p.postoLon = escolhido.lon;
    p.postoDesvioKm = escolhido.desvioKm;
    p.postoPlaceId = escolhido.placeId;
  },

  _buscarPostoRetroativo: function (p, coords, kmSo, idaVolta, limiteInferior) {
    var PASSO_KM = 20;
    var MAX_TENTATIVAS = 6;
    var kmOriginal = p.kmAcum;
    var tentativa = 0;

    function tentar() {
      tentativa++;
      var novoKm = kmOriginal - (PASSO_KM * tentativa);
      if (novoKm < limiteInferior || tentativa > MAX_TENTATIVAS) {
        p.semPosto = 1;
        return Promise.resolve();
      }
      var pos = Viagens._posicaoNaLinha(coords, novoKm, kmSo, idaVolta);
      if (!pos) return tentar();
      return Viagens.chamarPlaces(pos[0], pos[1], 12000, 5, 'gas_station').then(function (locais) {
        if (locais.length) {
          Viagens._aplicarPostoEncontrado(p, locais);
          p.antecipada = true;
          p.kmOriginalPrevisto = kmOriginal;
          p.kmAntecipadoEm = Math.round((kmOriginal - novoKm) * 10) / 10;
          p.kmAcum = Math.round(novoKm * 10) / 10;
          p.lat = pos[0]; p.lon = pos[1];
          if (idaVolta && novoKm > kmSo) {
            p.trecho = 'VOLTA';
            p.kmNoTrecho = Math.round((novoKm - kmSo) * 10) / 10;
          } else {
            p.trecho = 'IDA';
            p.kmNoTrecho = Math.round(novoKm * 10) / 10;
          }
          return;
        }
        return tentar();
      }).catch(function () { return tentar(); });
    }
    return tentar();
  },

  _posicaoNaLinha: function (coords, kmAcum, kmSo, idaVolta) {
    var kmAlvo = kmAcum;
    if (idaVolta && kmAcum > kmSo) kmAlvo = Math.max(0, (2 * kmSo) - kmAcum);
    var acum = 0;
    for (var i = 1; i < coords.length; i++) {
      var d = Viagens._haversine(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
      acum += d;
      if (acum >= kmAlvo) return coords[i];
    }
    return coords[coords.length - 1];
  },
  _haversine: function (lat1, lon1, lat2, lon2) {
    var R = 6371;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },
  verificarManutencao: function (veiculoId, distancia) {
    var hoje = App.hojeISO();
    var dataFim = Viagens.plano.idaVolta ? Viagens._somarDias(hoje, 3) : hoje;
    return sb.rpc('verificar_manutencao_viagem', {
      p_veiculo_id: veiculoId,
      p_distancia: distancia,
      p_data_inicio: hoje,
      p_data_fim: dataFim
    }).then(function (r) {
      if (r.error) return null;
      return r.data;
    });
  },
  _somarDias: function (iso, dias) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().substring(0, 10);
  },
  _geocodificarAntesDeRotas: function (qual, texto) {
    Viagens.chamarGeocode({ endereco: texto })
      .then(function (resultados) {
        if (!resultados.length) { App.toast('Endereço não encontrado: ' + texto, 'erro'); return; }
        var r = resultados[0];
        Viagens.plano[qual] = { lat: r.lat, lon: r.lon, endereco: r.endereco };
        document.getElementById(qual === 'origem' ? 'plOrigem' : 'plDestino').value = r.endereco;
        Viagens.buscarRotas();
      })
      .catch(function (e) { App.toast(e.message || 'Erro ao buscar endereço', 'erro'); });
  },
  /* =========================================================
     MOSTRAR ROTAS (resultados)
     ========================================================= */
  mostrarRotas: function (carregando) {
    var rotas = Viagens.plano.rotas;
    if (!rotas || !rotas.length) return;
    var idaVolta = Viagens.plano.idaVolta;
    var origemTxt = Viagens.plano.origem.endereco;
    var destinoTxt = Viagens.plano.destino.endereco;
    var idxAtiva = Viagens.plano.rotaAtiva;
    var dadosAtiva = Viagens.plano.paradasPorRota[idxAtiva];
    var veic = Viagens.plano.veiculoSelecionado;
    var p = Viagens.plano.parametrosAutonomia;

    var html = '';

    if (veic) html += Viagens._veiculoBlocoHTML(veic) + '<div style="margin-bottom:14px"></div>';

    html += Viagens._htmlCabecalhoRota(origemTxt, destinoTxt, idaVolta);
      '<span class="ms">' + (idaVolta ? 'sync_alt' : 'east') + '</span>' +
      '<div><b>' + App.esc(origemTxt.split(',')[0]) + ' ' + (idaVolta ? '⇄' : '→') + ' ' + App.esc(destinoTxt.split(',')[0]) + '</b>' +
      (idaVolta ? 'Ida e volta. Distância, combustível e pedágio já incluem o retorno.' : 'Somente ida') + '</div>' +
    '</div>';

    if (p) {
      var lReserva = p.tanque * (p.reserva / 100);
      var lUteis = p.tanque - lReserva;
      var lAgora = p.tanque * (p.nivel / 100);
      var autCheia = Math.round(p.kmL * p.tanque);
      var autIni = Math.round(p.kmL * Math.max(0, lAgora - lReserva));
      var autUtil = Math.round(p.kmL * lUteis);
      html += '<div class="resumo-autonomia" style="margin-bottom:16px">' +
        '<div style="font-size:11.5px;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">' +
          '<span class="ms" style="font-size:15px;vertical-align:middle;margin-right:4px;color:#ef4444">local_gas_station</span>Autonomia e paradas' +
        '</div>' +
        '<div class="grid3">' +
          '<div><b>' + autCheia + '</b><small>km tanque cheio</small></div>' +
          '<div><b>' + autIni + '</b><small>km disponíveis (' + p.nivel + '%)</small></div>' +
          '<div><b>' + autUtil + '</b><small>km entre paradas</small></div>' +
        '</div>' +
      '</div>';
    }

    if (dadosAtiva && dadosAtiva.manutencao && dadosAtiva.manutencao.alertas && dadosAtiva.manutencao.alertas.length) {
      html += Viagens._htmlAlertasManutencao(dadosAtiva.manutencao.alertas);
    }
    if (dadosAtiva && dadosAtiva.erroParcial) {
      html += '<div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:12.5px;color:#fcd34d">' +
        '<span class="ms" style="vertical-align:middle;margin-right:4px">warning</span>' +
        'Não conseguimos verificar as revisões agora. A rota foi mantida — você pode tentar de novo depois, sem custo extra de busca de rota.' +
      '</div>';
    }

    if (dadosAtiva && dadosAtiva.paradas) {
      var antecipadas = dadosAtiva.paradas.filter(function (x) { return x.antecipada; });
      var semPostoReal = dadosAtiva.paradas.filter(function (x) { return x.semPosto; });
      if (antecipadas.length) {
        html += '<div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:12.5px;color:#fcd34d">' +
          '<span class="ms" style="vertical-align:middle;margin-right:4px">schedule</span>' +
          antecipadas.length + ' parada(s) antecipada(s) porque não havia posto no ponto ideal de autonomia. Veja os detalhes abaixo.' +
        '</div>';
      }
      if (semPostoReal.length) {
        html += '<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.5);border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:12.5px;color:#fca5a5">' +
          '<span class="ms" style="vertical-align:middle;margin-right:4px">report</span>' +
          '<b>' + semPostoReal.length + ' trecho(s) sem nenhum posto mapeado</b> dentro da faixa segura de autonomia. Considere levar combustível extra ou verificar localmente antes de seguir viagem.' +
        '</div>';
      }
    }

    html += '<h3 style="margin:18px 0 14px;font-size:16px">Escolha uma rota:</h3>';

    rotas.forEach(function (r) {
      var ativa = r.indice === idxAtiva;
      var dadosRota = Viagens.plano.paradasPorRota[r.indice];
      var pedagioTxt = '';
      if (r.temPedagio && r.pedagioDisponivel) pedagioTxt = '<b>' + App.moeda(r.custoPedagio) + '</b><small>pedágio</small>';
      else if (r.temPedagio) pedagioTxt = '<b>—</b><small>pedágio indisponível</small>';
      else pedagioTxt = '<b>—</b><small>sem pedágio</small>';

     var selos = '';

     if (r.seloRapida) {
        selos += '<div class="rota-selo" style="background:#3b82f6;' + (r.seloEconomica ? 'top:-10px' : '') + '">' +
          '<span class="ms">bolt</span>Mais rápida</div>';
      }
      if (r.seloEconomica) {
        var topoOffset = r.seloRapida ? 'top:20px' : 'top:-10px';
        selos += '<div class="rota-selo" style="background:#22c55e;' + topoOffset + '">' +
          '<span class="ms">savings</span>Mais econômica</div>';
      }

      var paradasBlocoHtml = '';
      if (ativa) {
        if (carregando && !dadosRota) {
          paradasBlocoHtml = '<div style="text-align:center;padding:14px 0">' +
            '<span class="ms" style="font-size:22px;opacity:.6">hourglass_top</span>' +
            '<p style="color:var(--txt2);font-size:12.5px;margin-top:6px">Calculando paradas e localizando postos...</p>' +
          '</div>';
        } else if (dadosRota) {
          var idaP = dadosRota.paradas.filter(function (x) { return x.trecho === 'IDA'; });
          var voltaP = dadosRota.paradas.filter(function (x) { return x.trecho === 'VOLTA'; });
          if (idaP.length || voltaP.length) {
            paradasBlocoHtml = '<div class="paradas-viagem" style="margin-top:' + (r.seloRapida && r.seloEconomica ? '34px' : '14px') + '">' +
              '<h4><span class="ms" style="color:#a78bfa">pin_drop</span> Paradas sugeridas</h4>';
            if (idaP.length) {
              paradasBlocoHtml += '<div class="parada-grupo-titulo" style="color:#3b82f6">' +
                '<span class="ms" style="font-size:14px;vertical-align:middle">east</span> IDA</div>' +
                idaP.map(Viagens.paradaHTML).join('');
            }
            if (voltaP.length) {
              paradasBlocoHtml += '<div class="parada-grupo-titulo" style="color:#a78bfa;margin-top:10px">' +
                '<span class="ms" style="font-size:14px;vertical-align:middle">west</span> VOLTA</div>' +
                voltaP.map(Viagens.paradaHTML).join('');
            }
            paradasBlocoHtml += '</div>';
          }
        }
      }

      html +=
        '<div id="rotaCard' + r.indice + '" class="rota-card' + (ativa ? ' selecionado' : '') + '" ' +
          'onclick="Viagens._cliqueCardRota(event,' + r.indice + ')" style="cursor:pointer;position:relative">' +
          selos +
          '<div class="rota-card-topo" style="' + (r.seloRapida && r.seloEconomica ? 'margin-top:20px' : '') + '">' +
            '<div><b style="display:block;font-size:16px">' + App.esc(r.nome) + '</b>' +
              '<small style="color:var(--txt2);font-size:12px">' + (idaVolta ? 'Ida e volta' : 'Só ida') + '</small></div>' +
            '<div style="text-align:right"><b style="display:block;font-size:22px;color:#fff">' + App.moeda(r.custoTotal) + '</b>' +
              '<small style="color:var(--txt2);font-size:10px;text-transform:uppercase">Custo previsto</small></div>' +
          '</div>' +
          '<div class="rota-card-grid">' +
            '<div><b>' + r.km + '</b><small>km</small></div>' +
            '<div><b>' + Viagens.fmtMinutos(r.minutos) + '</b><small>duração</small></div>' +
            '<div><b>' + App.moeda(r.custoCombustivel) + '</b><small>' + r.litros + ' L</small></div>' +
            '<div>' + pedagioTxt + '</div>' +
          '</div>' +
          paradasBlocoHtml +
          '<div class="rota-card-acoes">' +
            '<button class="btn-novo-sec" onclick="event.stopPropagation();Viagens.abrirMapaFullscreen(' + r.indice + ')"><span class="ms">map</span> Ver no mapa</button>' +
            '<button class="btn-novo" onclick="event.stopPropagation();Viagens.criarViagemDaRota(' + r.indice + ')"><span class="ms">check</span> Escolher</button>' +
          '</div>' +
        '</div>';
    });

html += '<div class="form-acoes-viagem" style="margin-top:20px"><button class="btn-cancelar-form" onclick="Viagens.voltarParaFormularioMantendoRotas()"><span class="ms">arrow_back</span> Voltar</button></div>';

    document.getElementById('formPlanoViagemContainer').innerHTML = html;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  _htmlAlertasManutencao: function (alertas) {
    var venc = alertas.filter(function (a) { return a.jaVencido; });
    var ida = alertas.filter(function (a) { return a.venceNaIda && !a.jaVencido; });
    var volta = alertas.filter(function (a) { return a.venceNaVolta && !a.jaVencido; });

    function bloco(lista, titulo, icone) {
      if (!lista.length) return '';
      return '<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.5);border-left:4px solid #ef4444;' +
        'border-radius:12px;padding:12px 14px;margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:8px;color:#ef4444;font-weight:700;font-size:13.5px;margin-bottom:4px">' +
          '<span class="ms">' + icone + '</span>' + titulo +
        '</div>' +
        lista.map(function (a) {
          return '<div style="font-size:12.5px;color:var(--txt,#e8eefc);padding:2px 0">' +
            App.esc(a.item) + ' <span style="color:#fca5a5">(' + App.esc(a.motivo || ('km ' + a.proximoKm)) + ')</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    return bloco(venc, venc.length + ' revisão(ões) JÁ VENCIDA(S)', 'error') +
      bloco(ida, ida.length + ' revisão(ões) vencem na IDA', 'east') +
      bloco(volta, volta.length + ' revisão(ões) vencem na VOLTA', 'west');
  },

  paradaHTML: function (p) {
    var estrelas = (p.postoRating > 0)
      ? '<span style="color:#f59e0b;font-size:11.5px;font-weight:700;margin-left:6px">' +
          '<span class="ms" style="font-size:13px;vertical-align:middle">star</span>' + p.postoRating.toFixed(1) +
        '</span>'
      : '';
    var titulo = p.postoNome || ('Parada ' + p.ordem);
    var linhaEndereco = '';
    var corNum = '#3b82f6';

    if (p.semPosto) {
      corNum = '#ef4444';
      linhaEndereco = '<small style="color:#fca5a5">' +
        '<span class="ms" style="font-size:13px;vertical-align:middle">report</span> ' +
        'Nenhum posto mapeado em toda a faixa segura desta parada. Considere levar combustível extra.</small>';
    } else if (p.antecipada) {
      corNum = '#f59e0b';
      linhaEndereco = '<small style="color:#fcd34d">' +
        '<span class="ms" style="font-size:13px;vertical-align:middle">schedule</span> ' +
        'Antecipada em ' + p.kmAntecipadoEm + ' km — não havia posto no ponto ideal (km ' + p.kmOriginalPrevisto + ')</small>' +
        (p.postoEndereco ? '<small>' + App.esc(p.postoEndereco) + '</small>' : '');
    } else if (p.postoEndereco) {
      linhaEndereco = '<small>' + App.esc(p.postoEndereco) +
        (p.postoDesvioKm > 0 ? ' · ' + p.postoDesvioKm + ' km de desvio' : '') + '</small>';
    }

    return '<div class="parada-item" style="margin-top:8px">' +
      '<div class="parada-num" style="background:' + corNum + '22;color:' + corNum + '">' + p.ordem + '</div>' +
      '<div class="parada-info">' +
        '<b>' + App.esc(titulo) + '</b>' + estrelas +
        linhaEndereco +
        '<div class="parada-valores"><span>km ' + p.kmNoTrecho + '</span><span>' + p.litrosPrevisto + ' L</span>' +
          (p.ultimaParada ? '<span>só o necessário</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  },

  /* =========================================================
     MAPA EM TELA CHEIA
     ========================================================= */
  abrirMapaFullscreen: function (idx) {
    var dados = Viagens.plano.paradasPorRota[idx];
    if (!dados) {
      Viagens.selecionarRotaPreview(idx);
      App.toast('Calculando paradas desta rota...', 'ok');
      return;
    }
    var rota = Viagens.plano.rotas[idx];
    Viagens._criarOverlayMapa(rota);
    setTimeout(function () { Viagens._desenharMapaFullscreen(rota, dados.paradas); }, 50);
  },
  _criarOverlayMapa: function (rota) {
    var existente = document.getElementById('viagensMapaFullscreen');
    if (existente) existente.remove();
    Viagens._marcadoresExtras = [];
    var overlay = document.createElement('div');
    overlay.id = 'viagensMapaFullscreen';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;background:var(--bg,#0b1120);display:flex;flex-direction:column';
    overlay.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--linha,#26365c)">' +
        '<button onclick="Viagens.fecharMapaFullscreen()" class="btn-cancelar-form" style="padding:8px 14px">' +
          '<span class="ms">arrow_back</span> Voltar' +
        '</button>' +
        '<div id="mapaFullTitulo" style="font-size:13px;color:var(--txt2)">' + (rota ? App.esc(rota.nome + ' · ' + rota.km + ' km') : '') + '</div>' +
      '</div>' +
      '<div id="mapaFullscreenLeaflet" style="flex:1;min-height:0"></div>' +
      '<div style="display:flex;gap:8px;padding:10px 12px;background:var(--card,#16213b);border-top:1px solid var(--linha,#26365c)">' +
        '<button class="btn-novo-sec" style="flex:1;justify-content:center" onclick="Viagens.buscarPostosNaAreaDoMapa()"><span class="ms" style="color:#ef4444">local_gas_station</span> Postos nesta área</button>' +
        '<button class="btn-novo" style="flex:1;justify-content:center" onclick="Viagens.fecharMapaFullscreen()"><span class="ms">list</span> Ver opções</button>' +
      '</div>';
    document.body.appendChild(overlay);
  },
  fecharMapaFullscreen: function () {
    var overlay = document.getElementById('viagensMapaFullscreen');
    if (overlay) overlay.remove();
    if (Viagens._mapaFull) { try { Viagens._mapaFull.remove(); } catch (e) {} Viagens._mapaFull = null; }
    Viagens._marcadoresExtras = [];
  },
  _iconePinPosto: function (cor, numero) {
    return L.divIcon({
      className: '',
      html: '<div style="position:relative;width:34px;height:34px">' +
        '<span class="ms" style="font-size:34px;color:' + cor + ';text-shadow:0 2px 5px rgba(0,0,0,.55);position:absolute;top:0;left:0">location_on</span>' +
        (numero != null ? '<span style="position:absolute;top:3px;left:0;width:34px;text-align:center;color:#fff;font-size:11px;font-weight:700">' + numero + '</span>' : '') +
      '</div>',
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -30]
    });
  },
  _desenharMapaFullscreen: function (rota, paradas) {
    var el = document.getElementById('mapaFullscreenLeaflet');
    if (!el || typeof L === 'undefined') return;
    if (Viagens._mapaFull) { try { Viagens._mapaFull.remove(); } catch (e) {} }
    Viagens._mapaFull = L.map('mapaFullscreenLeaflet', { zoomControl: true }).setView([-15.78, -47.92], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(Viagens._mapaFull);
    var coords = Viagens._decodificarPolyline(rota.polyline || '');
    if (!coords.length) return;
    var linha = L.polyline(coords, { color: '#3b82f6', weight: 5, opacity: 0.9 }).addTo(Viagens._mapaFull);
    var origem = Viagens.plano.origem, destino = Viagens.plano.destino;
    if (origem && origem.lat) {
      L.marker([origem.lat, origem.lon], { icon: Viagens._iconePinPosto('#22c55e', null) })
        .addTo(Viagens._mapaFull).bindTooltip('Origem', { permanent: true, direction: 'top', offset: [0, -30] });
    }
    if (destino && destino.lat) {
      L.marker([destino.lat, destino.lon], { icon: Viagens._iconePinPosto('#ef4444', null) })
        .addTo(Viagens._mapaFull).bindTooltip('Destino', { permanent: true, direction: 'top', offset: [0, -30] });
    }
    (paradas || []).forEach(function (p) {
      if (!p.lat || !p.lon) return;
      var cor = p.semPosto ? '#ef4444' : (p.antecipada ? '#f59e0b' : (p.trecho === 'VOLTA' ? '#a78bfa' : '#3b82f6'));
      var nomeExibido = p.postoNome || ('Parada ' + p.ordem);
      var m = L.marker([p.lat, p.lon], { icon: Viagens._iconePinPosto(cor, p.ordem) }).addTo(Viagens._mapaFull);
      m.bindTooltip(nomeExibido, { permanent: true, direction: 'top', offset: [0, -30], className: 'tooltip-posto-carway' });
      var popupTxt = '<b>' + App.esc(nomeExibido) + '</b><br>' + p.trecho + ' · km ' + p.kmNoTrecho;
      if (p.antecipada) popupTxt += '<br><span style="color:#f59e0b">Antecipada em ' + p.kmAntecipadoEm + ' km</span>';
      if (p.semPosto) popupTxt += '<br><span style="color:#ef4444">Sem posto mapeado nesta faixa</span>';
      m.bindPopup(popupTxt);
    });
    setTimeout(function () {
      Viagens._mapaFull.invalidateSize();
      try { Viagens._mapaFull.fitBounds(linha.getBounds(), { padding: [30, 30] }); } catch (e) {}
    }, 150);
  },

  buscarPostosNaAreaDoMapa: function () {
    if (!Viagens._mapaFull) return;
    var dados = Viagens.plano.paradasPorRota[Viagens.plano.rotaAtiva];
    var paradas = dados ? dados.paradas : [];
    if (!paradas.length) { App.toast('Nenhuma parada nesta rota', 'erro'); return; }
    var centro = Viagens._mapaFull.getCenter();
    var maisProxima = null, menorDist = Infinity;
    paradas.forEach(function (p) {
      if (!p.lat || !p.lon) return;
      var d = Viagens._haversine(centro.lat, centro.lng, p.lat, p.lon);
      if (d < menorDist) { menorDist = d; maisProxima = p; }
    });
    if (!maisProxima) { App.toast('Não há paradas com localização definida nesta rota', 'erro'); return; }

    var veic = Viagens.plano.veiculoSelecionado;
    var categoria = veic ? Viagens._categoriaCombustivel(veic.combustivel) : 'combustivel';
    App.toast('Buscando num raio de 20 km da parada ' + maisProxima.ordem + '...', 'ok');

    var busca = categoria === 'eletrico'
      ? Viagens._buscarPontosRecargaOCM(maisProxima.lat, maisProxima.lon)
      : Viagens._buscarPostosOverpass(maisProxima.lat, maisProxima.lon, 20000);

    busca.then(function (locais) {
      Viagens._adicionarMarcadoresExtras(locais, categoria);
    }).catch(function () {
      App.toast('Erro ao buscar postos nesta área', 'erro');
    });
  },
  _adicionarMarcadoresExtras: function (locais, categoria) {
    if (!Viagens._mapaFull) return;
    (Viagens._marcadoresExtras || []).forEach(function (m) { try { Viagens._mapaFull.removeLayer(m); } catch (e) {} });
    Viagens._marcadoresExtras = [];
    if (!locais || !locais.length) {
      App.toast('Nenhum posto encontrado nesse raio', 'erro');
      return;
    }
    var cor = categoria === 'eletrico' ? '#22c55e' : '#f59e0b';
    locais.slice(0, 15).forEach(function (p) {
      if (!p.lat || !p.lon) return;
      var icone = L.divIcon({
        className: '',
        html: '<span class="ms" style="font-size:28px;color:' + cor + ';text-shadow:0 2px 5px rgba(0,0,0,.55)">location_on</span>',
        iconSize: [28, 28], iconAnchor: [14, 26]
      });
      var m = L.marker([p.lat, p.lon], { icon: icone }).addTo(Viagens._mapaFull);
      m.bindTooltip(p.nome, { permanent: false, direction: 'top', offset: [0, -24] });
      m.bindPopup('<b>' + App.esc(p.nome) + '</b>' + (p.endereco ? '<br>' + App.esc(p.endereco) : '') + (p.distanciaKm != null ? '<br>' + p.distanciaKm + ' km' : ''));
      Viagens._marcadoresExtras.push(m);
    });
    App.toast(locais.length + ' posto(s) encontrado(s) nesta área', 'ok');
  },
  _decodificarPolyline: function (encoded) {
    if (!encoded) return [];
    var pontos = [], index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      var b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;
      pontos.push([lat * 1e-5, lng * 1e-5]);
    }
    return pontos;
  },
  fmtMinutos: function (min) {
    min = Math.round(min);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m < 10 ? '0' : '') + m;
  },

  /* =========================================================
     CRIAR VIAGEM
     ========================================================= */
  criarViagemDaRota: function (idx) {
    var r = Viagens.plano.rotas[idx];
    if (!r) return;
    var dados = Viagens.plano.paradasPorRota[idx];
    var idaVolta = Viagens.plano.idaVolta;
    var veic = Viagens.plano.veiculoSelecionado || Viagens.veiculos[0];
    var origemTxt = Viagens.plano.origem.endereco.split(',')[0];
    var destinoTxt = Viagens.plano.destino.endereco.split(',')[0];
    var hoje = App.hojeISO();
    var tituloPadrao = origemTxt + ' → ' + destinoTxt;
    var tituloInicial = document.getElementById('plNomeViagem') ? document.getElementById('plNomeViagem').value.trim() : '';

    var html =
      '<h2 class="form-titulo">Criar viagem</h2>' +
      Viagens._veiculoBlocoHTML(veic) +
      '<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.4);border-radius:12px;padding:12px 14px;margin:14px 0 16px">' +
        '<div style="display:flex;align-items:center;gap:8px;color:#86efac;font-weight:700;font-size:13.5px">' +
          '<span class="ms">check_circle</span>' + App.esc(r.nome) + ' · ' + (idaVolta ? 'ida e volta' : 'só ida') +
        '</div>' +
        '<div style="font-size:12.5px;color:var(--txt2);margin-top:4px">' +
          r.km + ' km · ' + (dados ? dados.paradas.length : 0) + ' parada(s) · previsão de ' + App.moeda(r.custoTotal) +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Nome da viagem <small style="text-transform:none;color:var(--txt2);font-weight:400">(opcional)</small></label>' +
        '<input type="text" id="crTitulo" value="' + App.esc(tituloInicial) + '" placeholder="' + App.esc(tituloPadrao) + '" maxlength="100">' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Saída</label><input type="date" id="crDataInicio" value="' + hoje + '"></div>' +
        '<div class="campo-form"><label>Retorno</label><input type="date" id="crDataFim"></div>' +
      '</div>' +
      '<div class="campo-form"><label>KM do painel</label><input type="number" id="crKmInicial" placeholder="0"></div>' +
      '<h3 style="margin:18px 0 10px;font-size:12.5px;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px">Orçamento previsto</h3>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Alimentação</label><input type="number" id="crAlim" step="0.01" placeholder="0,00"></div>' +
        '<div class="campo-form"><label>Hospedagem</label><input type="number" id="crHosp" step="0.01" placeholder="0,00"></div>' +
      '</div>' +
      '<div class="campo-form"><label>Outros gastos</label><input type="number" id="crOutros" step="0.01" placeholder="0,00"></div>' +
      '<small style="display:block;margin:-8px 0 16px;color:var(--txt2);font-size:12px">' +
        'Combustível (' + App.moeda(r.custoCombustivel) + ') e pedágio (' + App.moeda(r.custoPedagio) + ') já entram no orçamento.' +
      '</small>' +
      '<div class="campo-form"><label>Observações</label>' +
        '<textarea id="crObs" rows="2" style="width:100%;background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;color:var(--txt);font-family:inherit;font-size:14px;resize:vertical"></textarea>' +
      '</div>' +
      '<div class="form-acoes-viagem">' +
        '<button class="btn-cancelar-form" onclick="Viagens.mostrarRotas()"><span class="ms">arrow_back</span> Voltar</button>' +
        '<button class="btn-novo btn-bloco-full" id="btnCriarViagem" onclick="Viagens.confirmarCriarViagem(' + idx + ')"><span class="ms">check</span> Criar viagem</button>' +
      '</div>';
    document.getElementById('formPlanoViagemContainer').innerHTML = html;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
    confirmarCriarViagem: function (idx) {
    var r = Viagens.plano.rotas[idx];
    if (!r) return;
    if (Viagens._salvando) return;
    Viagens._salvando = true;
    var dados = Viagens.plano.paradasPorRota[idx];
    var idaVolta = Viagens.plano.idaVolta;
    var veic = Viagens.plano.veiculoSelecionado || Viagens.veiculos[0];
    var veicId = veic.id;
    var origemCurta = Viagens.plano.origem.endereco.split(',')[0];
    var destinoCurto = Viagens.plano.destino.endereco.split(',')[0];
    var tituloDigitado = document.getElementById('crTitulo').value.trim();
    var tituloFinal = tituloDigitado || (origemCurta + ' → ' + destinoCurto);
    var dataInicio = document.getElementById('crDataInicio').value;
    var dataFim = document.getElementById('crDataFim').value || null;
    var kmInicial = Number(document.getElementById('crKmInicial').value) || 0;
    var alim = Number(document.getElementById('crAlim').value) || 0;
    var hosp = Number(document.getElementById('crHosp').value) || 0;
    var outros = Number(document.getElementById('crOutros').value) || 0;
    var obs = document.getElementById('crObs').value.trim();
    var totalPrev = Math.round((r.custoCombustivel + r.custoPedagio + alim + hosp + outros) * 100) / 100;
    var reg = {
      id: 'VIA_' + App.uid(),
      organizacaoId: orgAtual.id,
      usuarioCriadorId: usuarioAtual.id,
      veiculoId: veicId,
      titulo: tituloFinal,
      origem: Viagens.plano.origem.endereco,
      destino: Viagens.plano.destino.endereco,
      dataInicio: dataInicio,
      dataFim: dataFim,
      idaVolta: idaVolta ? 'SIM' : 'NAO',
      kmInicial: kmInicial,
      kmFinal: 0,
      distancia: r.km,
      status: 'planejada',
      combustivelPrev: r.custoCombustivel,
      pedagioPrev: r.custoPedagio,
      alimentacaoPrev: alim,
      hospedagemPrev: hosp,
      outrosPrev: outros,
      totalPrev: totalPrev,
      rota: JSON.stringify({
        origem: Viagens.plano.origem,
        destino: Viagens.plano.destino,
        km: r.km,
        kmIda: r.kmIda,
        minutos: r.minutos,
        polyline: r.polyline,
        idaVolta: idaVolta,
        custoCombustivel: r.custoCombustivel,
        custoPedagio: r.custoPedagio,
        temPedagio: r.temPedagio
      }),
      obs: obs
    };
    var paradas = dados ? dados.paradas : [];
    var precoLitro = (Viagens.plano.parametrosAutonomia && Viagens.plano.parametrosAutonomia.preco) || 0;
    var paradasReg = paradas.map(function (p) {
      return {
        id: 'PAR_' + App.uid(),
        organizacaoId: orgAtual.id,
        viagemId: reg.id,
        veiculoId: veicId,
        ordem: p.ordem,
        kmPrevisto: p.kmAcum,
        latitude: p.lat || 0,
        longitude: p.lon || 0,
        postoNome: p.postoNome || '',
        postoEndereco: p.postoEndereco || '',
        postoRating: p.postoRating || 0,
        postoPlaceId: p.postoPlaceId || '',
        postoLat: p.postoLat || 0,
        postoLon: p.postoLon || 0,
        postoDesvioKm: p.postoDesvioKm || 0,
        litrosPrevisto: p.litrosPrevisto || 0,
        precoLitroPrevisto: precoLitro,
        valorPrevisto: Math.round((p.litrosPrevisto || 0) * precoLitro * 100) / 100,
        litrosReal: 0,
        valorReal: 0,
        status: p.semPosto ? 'SEM_POSTO' : 'PENDENTE',
        trecho: p.trecho || 'IDA',
        ordemTrecho: p.ordem,
        titulo: (p.trecho || 'IDA') + ' - Parada ' + p.ordem,
        kmAteFim: 0,
        ultimaParada: !!p.ultimaParada,
        energetico: veic.combustivel || 'Gasolina',
        unidadeQuantidade: 'L',
        antecipada: !!p.antecipada,
        kmOriginalPrevisto: p.kmOriginalPrevisto || 0
      };
    });
    var btn = document.getElementById('btnCriarViagem');
    btn.disabled = true;
    btn.textContent = 'Criando...';
    sb.rpc('criar_viagem_com_paradas', {
      p_viagem: reg,
      p_paradas: paradasReg
    }).then(function (res) {
      Viagens._salvando = false;
      if (res.error) {
        console.error('CarWay - erro na RPC de criação:', res.error);
        return Viagens._criarViagemModoAntigo(reg, paradasReg, btn);
      }
      if (App._painelRaw) App._painelRaw = null;
      App.toast(paradasReg.length ? 'Viagem criada com ' + paradasReg.length + ' parada(s)!' : 'Viagem criada!', 'ok');
      App.irPara('viagens');
    }).catch(function (e) {
      Viagens._salvando = false;
      console.error('CarWay - falha na RPC de criação:', e);
      return Viagens._criarViagemModoAntigo(reg, paradasReg, btn);
    });
  },

  _criarViagemModoAntigo: function (reg, paradasReg, btn) {
    return sb.from('viagens').insert(reg).then(function (res) {
      if (res.error) {
        Viagens._salvando = false;
        App.toast('Erro: ' + res.error.message, 'erro');
        if (btn) { btn.disabled = false; btn.textContent = 'Criar viagem'; }
        return;
      }
      if (!paradasReg.length) {
        Viagens._salvando = false;
        if (App._painelRaw) App._painelRaw = null;
        App.toast('Viagem criada!', 'ok');
        App.irPara('viagens');
        return;
      }
      return sb.from('paradas_viagem').insert(paradasReg).then(function (rp) {
        Viagens._salvando = false;
        if (rp.error) {
          console.error('CarWay - erro ao salvar paradas:', rp.error);
          App.abrirModal(
            'Viagem criada sem paradas',
            '<div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);border-radius:12px;padding:12px 14px;font-size:13px;color:#fcd34d;line-height:1.6">' +
              '<b><span class="ms" style="vertical-align:middle;font-size:17px">warning</span> A viagem foi salva, mas as paradas não.</b><br>' +
              'Motivo: ' + App.esc(rp.error.message || 'erro desconhecido') +
            '</div>' +
            '<p style="font-size:12.5px;color:var(--txt2);line-height:1.6;margin-top:12px">' +
              'Exclua esta viagem e crie novamente após resolver o problema.' +
            '</p>',
            function () { App.fecharModal(); App.irPara('viagens'); },
            'Entendi'
          );
          return;
        }
        if (App._painelRaw) App._painelRaw = null;
        App.toast('Viagem criada com ' + paradasReg.length + ' parada(s)!', 'ok');
        App.irPara('viagens');
      });
    }).catch(function (e) {
      Viagens._salvando = false;
      console.error('CarWay - falha ao criar viagem:', e);
      App.toast('Erro ao criar viagem: ' + (e.message || 'desconhecido'), 'erro');
      if (btn) { btn.disabled = false; btn.textContent = 'Criar viagem'; }
    });
  },
  /* =========================================================
     BUSCA DE POSTOS / PONTOS DE RECARGA (gratuito, sem custo de API)
     ========================================================= */
  _OVERPASS_MIRRORS: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
  ],
  _haversineKm: function (lat1, lon1, lat2, lon2) { return Viagens._haversine(lat1, lon1, lat2, lon2); },
  _categoriaCombustivel: function (combustivel) {
    var c = String(combustivel || '').toUpperCase();
    if (c.indexOf('ELÉTR') > -1 || c.indexOf('ELETR') > -1) return 'eletrico';
    if (c.indexOf('GNV') > -1) return 'gnv';
    return 'combustivel';
  },
  _obterLocalizacaoAtual: function () {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('GPS indisponível')); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      }, function () {
        reject(new Error('Não foi possível obter sua localização'));
      }, { enableHighAccuracy: true, timeout: 15000 });
    });
  },
  _buscarPontosRecargaOCM: function (lat, lon) {
    var key = (typeof CARWAY_CONFIG !== 'undefined' && CARWAY_CONFIG.OPEN_CHARGE_MAP_KEY) || '';
    var url = 'https://api.openchargemap.io/v3/poi/?output=json' +
      '&latitude=' + lat + '&longitude=' + lon +
      '&distance=15&distanceunit=KM&maxresults=8&compact=true&verbose=false' +
      (key ? '&key=' + encodeURIComponent(key) : '');
    return fetch(url).then(function (r) { return r.json(); }).then(function (lista) {
      return (lista || []).map(function (poi) {
        var addr = poi.AddressInfo || {};
        var conexoes = (poi.Connections || []).map(function (c) { return (c.ConnectionType || {}).Title; }).filter(Boolean);
        return {
          nome: addr.Title || 'Ponto de recarga',
          endereco: [addr.AddressLine1, addr.Town].filter(Boolean).join(', '),
          lat: addr.Latitude, lon: addr.Longitude,
          distanciaKm: typeof addr.Distance === 'number' ? Math.round(addr.Distance * 10) / 10 : null,
          conectores: conexoes.slice(0, 2).join(', ')
        };
      }).sort(function (a, b) { return (a.distanciaKm == null ? 99 : a.distanciaKm) - (b.distanciaKm == null ? 99 : b.distanciaKm); });
    });
  },
  _buscarPostosOverpass: function (lat, lon, raioMetros) {
    var raio = raioMetros || 5000;
    var query = '[out:json][timeout:15];(node["amenity"="fuel"](around:' + raio + ',' + lat + ',' + lon + '););out center 15;';
    var tentar = function (idx) {
      if (idx >= Viagens._OVERPASS_MIRRORS.length) {
        return Promise.reject(new Error('Servidores de mapas indisponíveis no momento'));
      }
      var url = Viagens._OVERPASS_MIRRORS[idx] + '?data=' + encodeURIComponent(query);
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
      return fetch(url, controller ? { signal: controller.signal } : {}).then(function (r) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!r.ok) throw new Error('status ' + r.status);
        return r.json();
      }).then(function (data) {
        var elementos = (data && data.elements) || [];
        return elementos.map(function (el) {
          var tags = el.tags || {};
          var elLat = el.lat || (el.center && el.center.lat);
          var elLon = el.lon || (el.center && el.center.lon);
          return {
            nome: tags.name || tags.brand || 'Posto sem nome',
            endereco: [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', '),
            lat: elLat, lon: elLon,
            distanciaKm: (elLat && elLon) ? Math.round(Viagens._haversineKm(lat, lon, elLat, elLon) * 10) / 10 : null
          };
        }).filter(function (p) { return p.lat && p.lon; })
          .sort(function (a, b) { return (a.distanciaKm == null ? 99 : a.distanciaKm) - (b.distanciaKm == null ? 99 : b.distanciaKm); });
      }).catch(function () {
        if (timeoutId) clearTimeout(timeoutId);
        return tentar(idx + 1);
      });
    };
    return tentar(0);
  },
  _linkBuscaMaps: function (termo, lat, lon) {
    var base = 'https://www.google.com/maps/search/' + encodeURIComponent(termo);
    if (lat && lon) return base + '/@' + lat + ',' + lon + ',14z';
    return base;
  },
  abrirBuscaPostos: function () {
    var veicSelecionado = Viagens.plano.veiculoSelecionado || null;
    if (!veicSelecionado) {
      var selPlano = document.getElementById('plVeiculo');
      if (selPlano && selPlano.value) {
        veicSelecionado = Viagens.veiculos.filter(function (v) { return v.id === selPlano.value; })[0];
      }
    }
    if (!veicSelecionado && typeof App !== 'undefined' && App.veiculoAtivoId) {
      veicSelecionado = Viagens.veiculos.filter(function (v) { return v.id === App.veiculoAtivoId; })[0];
    }
    if (veicSelecionado) {
      Viagens._buscarPostosPara(Viagens._categoriaCombustivel(veicSelecionado.combustivel));
      return;
    }
    var html = '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<button class="app-nav-item" onclick="App.fecharModal();Viagens._buscarPostosPara(\'combustivel\')">' +
        '<span class="ms" style="color:#ef4444">local_gas_station</span><b>Postos de combustível</b>' +
      '</button>' +
      '<button class="app-nav-item" onclick="App.fecharModal();Viagens._buscarPostosPara(\'eletrico\')">' +
        '<span class="ms" style="color:#22c55e">ev_station</span><b>Pontos de recarga elétrica</b>' +
      '</button>' +
      '<button class="app-nav-item" onclick="App.fecharModal();Viagens._buscarPostosPara(\'gnv\')">' +
        '<span class="ms" style="color:#3b82f6">local_gas_station</span><b>Postos de GNV</b>' +
      '</button>' +
    '</div>';
    App.abrirModal('O que você procura?', html, null);
  },
  _buscarPostosPara: function (categoria) {
    App.abrirModal(categoria === 'eletrico' ? 'Pontos de recarga próximos' : 'Postos próximos',
      '<div style="text-align:center;padding:20px 0"><span class="ms" style="font-size:36px;opacity:.5">hourglass_top</span>' +
      '<p style="color:var(--txt2);margin-top:10px">Obtendo sua localização...</p></div>', null);
    Viagens._obterLocalizacaoAtual().then(function (loc) {
      var busca = categoria === 'eletrico'
        ? Viagens._buscarPontosRecargaOCM(loc.lat, loc.lon)
        : Viagens._buscarPostosOverpass(loc.lat, loc.lon);
      busca.then(function (locais) {
        Viagens._mostrarListaPostos(categoria, locais, loc);
      }).catch(function () {
        var termo = categoria === 'eletrico' ? 'carregador para carro elétrico' : (categoria === 'gnv' ? 'posto de GNV' : 'posto de combustível');
        window.open(Viagens._linkBuscaMaps(termo, loc.lat, loc.lon), '_blank', 'noopener');
        App.fecharModal();
        App.toast('Busca detalhada indisponível — abrindo Google Maps', 'ok');
      });
    }).catch(function () {
      var termo = categoria === 'eletrico' ? 'carregador para carro elétrico' : (categoria === 'gnv' ? 'posto de GNV' : 'posto de combustível');
      window.open(Viagens._linkBuscaMaps(termo, null, null), '_blank', 'noopener');
      App.fecharModal();
      App.toast('Localização não disponível — abrindo busca geral no Maps', 'ok');
    });
  },
  _mostrarListaPostos: function (categoria, locais, loc) {
    var termo = categoria === 'eletrico' ? 'carregador para carro elétrico' : (categoria === 'gnv' ? 'posto de GNV' : 'posto de combustível');
    var linkGenerico = Viagens._linkBuscaMaps(termo, loc.lat, loc.lon);
    if (!locais || !locais.length) {
      App.abrirModal(categoria === 'eletrico' ? 'Pontos de recarga próximos' : 'Postos próximos',
        '<div style="text-align:center;padding:10px 0;color:var(--txt2)">' +
          '<span class="ms" style="font-size:44px;opacity:.5">location_off</span>' +
          '<p style="margin-top:10px">Nenhum resultado encontrado nas proximidades.</p>' +
        '</div>' +
        '<button class="btn-novo" style="width:100%" onclick="window.open(\'' + linkGenerico + '\',\'_blank\')">' +
          '<span class="ms">map</span> Abrir busca no Google Maps' +
        '</button>', null);
      return;
    }
    var icone = categoria === 'eletrico' ? 'ev_station' : 'local_gas_station';
    var cor = categoria === 'eletrico' ? '#22c55e' : '#ef4444';
    var html = '<div style="display:flex;flex-direction:column;gap:10px">' +
      locais.slice(0, 8).map(function (p) {
        var linkPonto = 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lon;
        return '<button onclick="window.open(\'' + linkPonto + '\',\'_blank\')" ' +
          'style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;' +
          'background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);text-align:left;cursor:pointer;font-family:inherit;color:var(--txt,#e8eefc);width:100%">' +
          '<span class="ms" style="color:' + cor + ';font-size:22px">' + icone + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<b style="display:block;font-size:14px">' + App.esc(p.nome) + '</b>' +
            (p.endereco ? '<small style="display:block;color:var(--txt2)">' + App.esc(p.endereco) + '</small>' : '') +
            (p.conectores ? '<small style="display:block;color:var(--txt2)">' + App.esc(p.conectores) + '</small>' : '') +
          '</div>' +
          (p.distanciaKm != null ? '<b style="flex:none;color:' + cor + '">' + p.distanciaKm + ' km</b>' : '') +
        '</button>';
      }).join('') +
      '<button class="btn-novo-sec" style="width:100%" onclick="window.open(\'' + linkGenerico + '\',\'_blank\')">' +
        '<span class="ms">map</span> Ver todos no Google Maps' +
      '</button>' +
    '</div>';
    App.abrirModal(categoria === 'eletrico' ? 'Pontos de recarga próximos' : 'Postos próximos', html, null);
  },
  /* =========================================================
     DETALHE DA VIAGEM
     ========================================================= */
  abrirDetalhe: function (id) {
    var el = document.getElementById('detalheViagemContainer');
    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';
    Viagens._paradasGrupoAberto = { IDA: false, VOLTA: false };
    Promise.all([
      sb.from('viagens').select('*').eq('id', id).single(),
      sb.from('abastecimentos').select('*').eq('viagemId', id).order('data'),
      sb.from('despesas').select('*').eq('viagemId', id).order('data'),
      sb.from('manutencoes').select('*').eq('viagemId', id).order('data'),
      sb.from('paradas_viagem').select('*').eq('viagemId', id).order('ordem'),
      sb.from('veiculos').select('id, nome, placa, tipo, cor, combustivel').eq('organizacaoId', orgAtual.id)
    ]).then(function (r) {
      if (r[0].error || !r[0].data) { el.innerHTML = '<div class="vazio-veiculo"><p>Viagem não encontrada.</p></div>'; return; }
      Viagens._detalheAtual = {
        viagem: r[0].data,
        abastecimentos: r[1].data || [],
        despesas: r[2].data || [],
        manutencoes: r[3].data || [],
        paradas: r[4].data || [],
        veiculos: r[5].data || []
      };
      Viagens._detalheAtual.paradas.forEach(function (p) {
        p.abastecimentoVinculado = String(p.origemConclusao || '').toUpperCase() === 'VINCULADO';
      });
      Viagens.renderDetalhe();
    });
  },

  renderDetalhe: function () {
    var el = document.getElementById('detalheViagemContainer');
    var d = Viagens._detalheAtual;
    if (!d) return;
    var v = d.viagem;
    var abs = d.abastecimentos, desp = d.despesas, manut = d.manutencoes, paradas = d.paradas;
    var veiculo = d.veiculos.filter(function (x) { return x.id === v.veiculoId; })[0];

    var totComb = 0, litros = 0;
    abs.forEach(function (a) {
      var val = Number(a.valorTotal) || (Number(a.litros) || 0) * (Number(a.precoLitro) || 0);
      totComb += val; litros += Number(a.litros) || 0;
    });
    var totDesp = 0; desp.forEach(function (x) { totDesp += Number(x.valor) || 0; });
    var totManut = 0; manut.forEach(function (x) { totManut += Number(x.custo) || 0; });
    var total = totComb + totDesp + totManut;
    var kmReal = v.kmFinal > 0 ? (Number(v.kmFinal) - Number(v.kmInicial)) : Number(v.distancia);
    var custoKm = kmReal > 0 ? total / kmReal : 0;

    /* CORRIGIDO (6.3): separa o valor REAL gasto por categoria de
       despesa (Alimentação/Hospedagem/Pedágio/Outros), em vez de
       jogar tudo dentro de "Outros" — bug que fazia a barra "Outros"
       crescer sempre, não importa a categoria realmente lançada. */
    var realPedagio = 0, realAlim = 0, realHosp = 0, realOutros = 0;
    desp.forEach(function (x) {
      var val = Number(x.valor) || 0;
      if (x.categoria === 'Alimentação') realAlim += val;
      else if (x.categoria === 'Hospedagem') realHosp += val;
      else if (x.categoria === 'Pedágio') realPedagio += val;
      else realOutros += val;
    });
    realOutros += totManut;

    var corVeic = veiculo && App._corVeiculo ? App._corVeiculo(veiculo) : '#3b82f6';
    var icoVeic = veiculo && App._iconeTipoVeiculo ? App._iconeTipoVeiculo(veiculo.tipo) : 'directions_car';

    var html =
      '<div class="detalhe-cab">' +
        '<h2>' + App.esc(v.titulo || (v.origem + ' → ' + v.destino)) + '</h2>' +
        '<div class="rota"><span class="ms" style="color:#22c55e">trip_origin</span>' + App.esc(v.origem) +
          '<span class="ms" style="color:#60a5fa">' + (String(v.idaVolta).toUpperCase() === 'SIM' ? 'sync_alt' : 'east') + '</span>' + App.esc(v.destino) + '</div>' +
        '<div class="rota" style="margin-top:6px"><span class="ms" style="color:#f59e0b">event</span>' + Viagens.fmtData(v.dataInicio) +
          (v.dataFim ? ' → ' + Viagens.fmtData(v.dataFim) : '') + '</div>' +
        (veiculo ? '<div class="rota" style="margin-top:6px;color:' + corVeic + '"><span class="ms" style="color:' + corVeic + '">' + icoVeic + '</span>' + App.esc(veiculo.nome) + ' · ' + App.esc(veiculo.placa || 'sem placa') + '</div>' : '') +
        '<div class="detalhe-nums">' +
          '<div class="detalhe-num"><b>' + App.fmtNum(kmReal) + '</b><small>KM</small></div>' +
          '<div class="detalhe-num"><b>' + App.moeda(total) + '</b><small>Gasto total</small></div>' +
          '<div class="detalhe-num"><b>' + App.moeda(custoKm) + '</b><small>Custo/km</small></div>' +
        '</div>' +
        /* CORRIGIDO (6.1): botões no padrão visual do app (btn-novo-sec
           uniformes, em grade de 4 colunas iguais) em vez de pilulas
           pequenas fora do padrão. */
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px">' +
          (v.status !== 'concluida'
            ? '<button class="btn-novo-sec" style="justify-content:center;padding:9px 4px;font-size:12px" onclick="App.irParaEncerrarViagem(\'' + v.id + '\')"><span class="ms" style="color:#22c55e;font-size:17px">stop_circle</span> Encerrar</button>'
            : '<div></div>') +
          '<button class="btn-novo-sec" style="justify-content:center;padding:9px 4px;font-size:12px" onclick="App.irParaFormViagem(\'' + v.id + '\')"><span class="ms" style="color:#60a5fa;font-size:17px">edit</span> Editar</button>' +
          '<button class="btn-novo-sec" style="justify-content:center;padding:9px 4px;font-size:12px" onclick="Viagens.formOrcamento(\'' + v.id + '\')"><span class="ms" style="color:#a78bfa;font-size:17px">savings</span> Orçamento</button>' +
          '<button class="btn-novo-sec" style="justify-content:center;padding:9px 4px;font-size:12px;color:#ef4444;border-color:#ef444455" onclick="Viagens.excluir(\'' + v.id + '\')"><span class="ms" style="font-size:17px">delete</span> Excluir</button>' +
        '</div>' +
      '</div>';

    html += '<div class="bloco">' +
      '<div class="bloco-titulo"><h3><span class="ms" style="color:#f59e0b">bolt</span> Lançar agora</h3></div>' +
      '<div class="atalhos" style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px">' +
        '<button onclick="Viagens.lancarAbastecimentoViagem(\'' + v.id + '\',\'' + v.veiculoId + '\')" style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-radius:14px;padding:13px 4px;color:var(--txt,#e8eefc);display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">' +
          '<span class="ms" style="font-size:24px;color:#ef4444">local_gas_station</span><small style="font-size:10.5px">Abastecer</small></button>' +
        '<button onclick="Viagens.lancarDespesaViagem(\'' + v.id + '\',\'' + v.veiculoId + '\',\'Alimentação\')" style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-radius:14px;padding:13px 4px;color:var(--txt,#e8eefc);display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">' +
          '<span class="ms" style="font-size:24px;color:#22c55e">restaurant</span><small style="font-size:10.5px">Alimentação</small></button>' +
        '<button onclick="Viagens.lancarDespesaViagem(\'' + v.id + '\',\'' + v.veiculoId + '\',\'Hospedagem\')" style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-radius:14px;padding:13px 4px;color:var(--txt,#e8eefc);display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">' +
          '<span class="ms" style="font-size:24px;color:#a78bfa">hotel</span><small style="font-size:10.5px">Estadia</small></button>' +
        '<button onclick="Viagens.lancarDespesaViagem(\'' + v.id + '\',\'' + v.veiculoId + '\',\'Pedágio\')" style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-radius:14px;padding:13px 4px;color:var(--txt,#e8eefc);display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">' +
          '<span class="ms" style="font-size:24px;color:#f59e0b">toll</span><small style="font-size:10.5px">Pedágio</small></button>' +
      '</div>' +
    '</div>';

    html += Viagens.renderOrcado(v, {
      combustivel: totComb, pedagio: realPedagio, alimentacao: realAlim, hospedagem: realHosp, outros: realOutros, total: total
    });

    if (paradas.length) html += Viagens.renderParadasPlanejadas(paradas);

    /* REMOVIDO (redundância): a lista de "Abastecimentos" só aparece
       quando a viagem NÃO tem paradas planejadas — quando há paradas,
       os abastecimentos vinculados já aparecem dentro de cada parada
       concluída, então repetir a lista aqui embaixo era informação
       duplicada. */
    if (abs.length && !paradas.length) {
      html += '<h2 class="secao-titulo"><span class="ms" style="color:#ef4444">local_gas_station</span> Abastecimentos (' + abs.length + ')</h2>' +
        '<div class="lista-abastecimentos">' + abs.map(Viagens.itemAbastecimento).join('') + '</div>';
    }
    if (desp.length) html += '<h2 class="secao-titulo"><span class="ms" style="color:#22c55e">receipt_long</span> Despesas (' + desp.length + ')</h2>' +
      '<div class="lista-abastecimentos">' + desp.map(Viagens.itemDespesa).join('') + '</div>';
    if (manut.length) html += '<h2 class="secao-titulo"><span class="ms" style="color:#f59e0b">build</span> Manutenções (' + manut.length + ')</h2>' +
      '<div class="lista-abastecimentos">' + manut.map(Viagens.itemManutencao).join('') + '</div>';

    html += '<div id="blocoMapaViagemDetalhe"></div>';

    el.innerHTML = html;
    Viagens._montarMapaDetalhe(v);
  },

  renderParadasPlanejadas: function (paradas) {
    var previsto = 0, realizado = 0, pendentes = 0;
    paradas.forEach(function (p) {
      previsto += Number(p.valorPrevisto) || 0;
      var st = String(p.status || 'PENDENTE').toUpperCase();
      if (st === 'CONCLUIDA') realizado += Number(p.valorReal) || 0;
      else if (st !== 'IGNORADA') pendentes++;
    });
    var idaP = paradas.filter(function (p) { return (p.trecho || 'IDA') === 'IDA'; });
    var voltaP = paradas.filter(function (p) { return (p.trecho || 'IDA') === 'VOLTA'; });

    var html = '<h2 class="secao-titulo"><span class="ms" style="color:#a78bfa">pin_drop</span> Paradas planejadas (' + paradas.length + ')</h2>' +
      '<div class="hub-resumo" style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:14px">' +
        '<div style="background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);border-radius:12px;padding:11px 6px;text-align:center"><b style="display:block;font-size:15px">' + App.moeda(previsto) + '</b><small style="color:var(--txt2);font-size:10px">previsto</small></div>' +
        '<div style="background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);border-radius:12px;padding:11px 6px;text-align:center"><b style="display:block;font-size:15px">' + App.moeda(realizado) + '</b><small style="color:var(--txt2);font-size:10px">realizado</small></div>' +
        '<div style="background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);border-radius:12px;padding:11px 6px;text-align:center"><b style="display:block;font-size:15px">' + pendentes + '</b><small style="color:var(--txt2);font-size:10px">pendentes</small></div>' +
      '</div>';

    if (idaP.length) html += Viagens._grupoParadaHTML('IDA', idaP);
    if (voltaP.length) html += Viagens._grupoParadaHTML('VOLTA', voltaP);
    return html;
  },

  _grupoParadaHTML: function (trecho, lista) {
    var aberto = Viagens._paradasGrupoAberto[trecho];
    var cor = trecho === 'VOLTA' ? '#a78bfa' : '#3b82f6';
    var concluidas = lista.filter(function (p) { return String(p.status).toUpperCase() === 'CONCLUIDA'; }).length;
    var previstoGrupo = lista.reduce(function (s, p) { return s + (Number(p.valorPrevisto) || 0); }, 0);
    return '<div style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-left:4px solid ' + cor + ';border-radius:14px;margin-bottom:12px;overflow:hidden">' +
      '<button onclick="Viagens.toggleGrupoParada(\'' + trecho + '\')" style="width:100%;display:flex;align-items:center;gap:10px;padding:13px 14px;background:transparent;border:0;cursor:pointer;font-family:inherit;text-align:left;color:var(--txt,#e8eefc)">' +
        '<span class="ms" style="font-size:20px;color:' + cor + '">' + (trecho === 'VOLTA' ? 'west' : 'east') + '</span>' +
        '<div style="flex:1;min-width:0"><b style="display:block;font-size:14px">' + trecho + '</b>' +
        '<small style="font-size:11.5px;color:var(--txt2)">' + concluidas + '/' + lista.length + ' concluída(s) · ' + App.moeda(previstoGrupo) + ' previstos</small></div>' +
        '<span class="ms" style="color:var(--txt2)">' + (aberto ? 'expand_less' : 'expand_more') + '</span>' +
      '</button>' +
      (aberto ? '<div style="padding:0 12px 12px">' + lista.map(Viagens.paradaSalvaHTML).join('') + '</div>' : '') +
    '</div>';
  },
  toggleGrupoParada: function (trecho) {
    Viagens._paradasGrupoAberto[trecho] = !Viagens._paradasGrupoAberto[trecho];
    Viagens.renderDetalhe();
  },

  /* CORRIGIDO (print8): botões "Abasteci aqui" / "Já lancei" / "Não
     parei" agora seguem o padrão visual do app, com os 3 na mesma
     largura/estilo (btn-novo-sec), em vez de pilulas pequenas
     inconsistentes. */
  paradaSalvaHTML: function (p) {
    var status = String(p.status || 'PENDENTE').toUpperCase();
    var concluida = status === 'CONCLUIDA';
    var ignorada = status === 'IGNORADA';
    var semPosto = status === 'SEM_POSTO';
    var antecipada = !!p.antecipada;
    var cor = concluida ? '#22c55e' : (ignorada ? '#94a3b8' : (semPosto ? '#ef4444' : (antecipada ? '#f59e0b' : '#3b82f6')));
    var titulo = p.postoNome || ('Parada ' + p.ordem);

    var estrelas = (p.postoRating > 0)
      ? '<span style="color:#f59e0b;font-size:11.5px;font-weight:700;margin-left:6px">' +
          '<span class="ms" style="font-size:13px;vertical-align:middle">star</span>' + Number(p.postoRating).toFixed(1) +
        '</span>'
      : '';

    var avisoAntecipada = '';
    if (semPosto) {
      avisoAntecipada = '<small style="color:#fca5a5"><span class="ms" style="font-size:13px;vertical-align:middle">report</span> Nenhum posto mapeado nesta faixa segura.</small>';
    } else if (antecipada) {
      avisoAntecipada = '<small style="color:#fcd34d"><span class="ms" style="font-size:13px;vertical-align:middle">schedule</span> Antecipada em ' +
        Math.round((p.kmOriginalPrevisto - p.kmPrevisto) * 10) / 10 + ' km (ideal seria no km ' + p.kmOriginalPrevisto + ')</small>';
    }

    var linhaValores = '<div class="parada-valores">' +
      '<span>km ' + App.fmtNum(p.kmPrevisto) + '</span>' +
      (concluida
        ? '<span>' + App.fmtNum(p.litrosReal, 1) + ' L · ' + App.moeda(p.valorReal) + '</span>'
        : '<span>' + App.fmtNum(p.litrosPrevisto, 1) + ' L · ' + App.moeda(p.valorPrevisto) + '</span>') +
    '</div>';

    var acoes = '';
    if (!concluida && !ignorada) {
      acoes = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px">' +
        '<button class="btn-novo-sec" style="justify-content:center;padding:8px 4px;font-size:11px" onclick="Viagens.formConcluirParada(\'' + p.id + '\')"><span class="ms" style="color:#ef4444;font-size:16px">local_gas_station</span> Abasteci</button>' +
        '<button class="btn-novo-sec" style="justify-content:center;padding:8px 4px;font-size:11px" onclick="Viagens.vincularAbastParada(\'' + p.id + '\')"><span class="ms" style="color:#60a5fa;font-size:16px">link</span> Já lancei</button>' +
        '<button class="btn-novo-sec" style="justify-content:center;padding:8px 4px;font-size:11px" onclick="Viagens.ignorarParada(\'' + p.id + '\')"><span class="ms" style="color:#94a3b8;font-size:16px">block</span> Não parei</button>' +
      '</div>';
    } else {
      acoes = '<div style="margin-top:8px">' +
        '<button class="btn-novo-sec" style="width:100%;justify-content:center" onclick="Viagens.reabrirParada(\'' + p.id + '\')"><span class="ms">undo</span> ' + (concluida ? 'Desfazer' : 'Reativar') + '</button>' +
      '</div>';
    }

    return '<div class="parada-item" style="border-top:1px solid var(--linha,#26365c);padding-top:10px;margin-top:10px">' +
      '<div class="parada-num" style="background:' + cor + '22;color:' + cor + '">' + p.ordem + '</div>' +
      '<div class="parada-info">' +
        '<b>' + App.esc(titulo) + '</b>' + estrelas +
        (avisoAntecipada || (p.postoEndereco ? '<small>' + App.esc(p.postoEndereco) + '</small>' : '')) +
        linhaValores +
        acoes +
      '</div>' +
    '</div>';
  },

    formConcluirParada: function (paradaId) {
    var d = Viagens._detalheAtual;
    var p = d.paradas.filter(function (x) { return x.id === paradaId; })[0];
    if (!p) return;
    var veiculo = d.veiculos.filter(function (x) { return x.id === d.viagem.veiculoId; })[0] || {};
    var combUpper = String(veiculo.combustivel || '').toUpperCase();
    var eletrico = combUpper.indexOf('ELÉTR') > -1 || combUpper.indexOf('ELETR') > -1;
    var unidade = eletrico ? 'kWh' : (combUpper.indexOf('GNV') > -1 ? 'm³' : 'L');
    var html =
      '<div class="aviso info" style="margin-bottom:16px">' +
        '<span class="ms" style="color:#ef4444">local_gas_station</span>' +
        '<div><b>' + App.esc(p.postoNome || ('Parada ' + p.ordem)) + '</b>' +
        'Previsto: ' + App.fmtNum(p.litrosPrevisto, 1) + ' ' + unidade + ' · ' + App.moeda(p.valorPrevisto) + '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Data</label><input type="date" id="cpData" value="' + App.hojeISO() + '"></div>' +
      '<div class="campo-form"><label>KM do painel</label><input type="number" id="cpKm" placeholder="0"></div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Quantidade (' + unidade + ')</label><input type="number" id="cpLitros" step="0.01" value="' + (p.litrosPrevisto || '') + '" oninput="Viagens._calcParadaConclusao()"></div>' +
        '<div class="campo-form"><label>Preço / ' + unidade + '</label><input type="number" id="cpPreco" step="0.001" value="' + (p.precoLitroPrevisto || '') + '" oninput="Viagens._calcParadaConclusao()"></div>' +
      '</div>' +
      '<div class="campo-form"><label>Valor total</label><input type="number" id="cpTotal" step="0.01" value="' + (p.valorPrevisto || '') + '" oninput="Viagens._calcParadaConclusaoInverso()"></div>' +
      '<div class="campo-form"><label>Posto</label><input type="text" id="cpPosto" value="' + App.esc(p.postoNome || '') + '"></div>';
    App.abrirModal('Registrar abastecimento', html, function () {
      var litros = Number(document.getElementById('cpLitros').value) || 0;
      if (litros <= 0) { App.toast('Informe a quantidade', 'erro'); return; }
      var km = Number(document.getElementById('cpKm').value) || 0;
      var reg = {
        id: 'ABS_' + App.uid(),
        organizacaoId: orgAtual.id,
        usuarioId: usuarioAtual.id,
        veiculoId: d.viagem.veiculoId,
        viagemId: d.viagem.id,
        paradaId: p.id,
        data: document.getElementById('cpData').value,
        km: km,
        litros: litros,
        precoLitro: Number(document.getElementById('cpPreco').value) || 0,
        valorTotal: Number(document.getElementById('cpTotal').value) || 0,
        posto: document.getElementById('cpPosto').value.trim(),
        combustivel: veiculo.combustivel || 'Gasolina',
        tanqueCheio: 'SIM',
        nivelTanque: 100
      };
      App.fecharModal();
      sb.from('abastecimentos').insert(reg).then(function (r1) {
        if (r1.error) { App.toast('Erro: ' + r1.error.message, 'erro'); return; }
        return sb.from('paradas_viagem').update({
          status: 'CONCLUIDA',
          litrosReal: litros,
          valorReal: reg.valorTotal,
          abastecimentoId: reg.id,
          origemConclusao: 'ABASTECI'
        }).eq('id', p.id);
      }).then(function (r2) {
        if (r2 && r2.error) { App.toast('Erro: ' + r2.error.message, 'erro'); return; }
        if (App._painelRaw) App._painelRaw = null;
        App.toast('Parada ' + p.ordem + ' concluída', 'ok');
        Viagens.abrirDetalhe(d.viagem.id);
      }).catch(function (e) {
        console.error('CarWay - erro ao concluir parada:', e);
        App.toast('Erro ao registrar abastecimento', 'erro');
      });
    }, 'Registrar');
  },
   
  _calcParadaConclusao: function () {
    var l = Number(document.getElementById('cpLitros').value) || 0;
    var p = Number(document.getElementById('cpPreco').value) || 0;
    var t = document.getElementById('cpTotal');
    if (t && l > 0 && p > 0) t.value = (l * p).toFixed(2);
  },
  _calcParadaConclusaoInverso: function () {
    var t = Number(document.getElementById('cpTotal').value) || 0;
    var l = Number(document.getElementById('cpLitros').value) || 0;
    if (t > 0 && l > 0) {
      var e = document.getElementById('cpPreco');
      if (e) e.value = (t / l).toFixed(3);
    }
  },

  vincularAbastParada: function (paradaId) {
    var d = Viagens._detalheAtual;
    App.abrirModal('Vincular abastecimento', '<div style="text-align:center;padding:16px 0"><span class="ms" style="font-size:32px;opacity:.5">hourglass_top</span></div>', null);
    sb.from('abastecimentos').select('*').eq('viagemId', d.viagem.id).is('paradaId', null).then(function (r) {
      var lista = r.data || [];
      if (!lista.length) {
        App.abrirModal('Vincular abastecimento',
          '<div style="text-align:center;padding:16px 0;color:var(--txt2)"><span class="ms" style="font-size:44px;opacity:.5">local_gas_station</span>' +
          '<p style="margin-top:10px">Nenhum abastecimento desta viagem está livre.<br>Use "Abasteci aqui" para lançar um novo.</p></div>', null);
        return;
      }
      var html = '<div style="display:flex;flex-direction:column;gap:10px">' +
        lista.map(function (a) {
          return '<button onclick="Viagens.confirmarVinculoParada(\'' + paradaId + '\',\'' + a.id + '\')" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);text-align:left;cursor:pointer;font-family:inherit;color:var(--txt,#e8eefc);width:100%">' +
            '<span class="ms" style="color:#ef4444">local_gas_station</span>' +
            '<div style="flex:1"><b>' + App.fmtNum(a.litros, 2) + ' L · ' + App.moeda(a.valorTotal) + '</b>' +
            '<small style="display:block;color:var(--txt2)">' + Viagens.fmtData(a.data) + ' · ' + App.fmtNum(a.km) + ' km · ' + App.esc(a.posto || 'Posto') + '</small></div>' +
          '</button>';
        }).join('') +
      '</div>';
      App.abrirModal('Vincular abastecimento', html, null);
    });
  },
   
  confirmarVinculoParada: function (paradaId, abastecimentoId) {
    App.fecharModal();
    var d = Viagens._detalheAtual;
    var a = d.abastecimentos.filter(function (x) { return x.id === abastecimentoId; })[0];
    sb.from('abastecimentos').update({ paradaId: paradaId }).eq('id', abastecimentoId).then(function (r1) {
      if (r1.error) { App.toast('Erro: ' + r1.error.message, 'erro'); return; }
      return sb.from('paradas_viagem').update({
        status: 'CONCLUIDA',
        litrosReal: a ? a.litros : 0,
        valorReal: a ? a.valorTotal : 0,
        abastecimentoId: abastecimentoId,
        origemConclusao: 'VINCULADO'
      }).eq('id', paradaId);
    }).then(function (r2) {
      if (r2 && r2.error) { App.toast('Erro: ' + r2.error.message, 'erro'); return; }
      if (App._painelRaw) App._painelRaw = null;
      App.toast('Abastecimento vinculado', 'ok');
      Viagens.abrirDetalhe(d.viagem.id);
    }).catch(function (e) {
      console.error('CarWay - erro ao vincular abastecimento:', e);
      App.toast('Erro ao vincular abastecimento', 'erro');
    });
  },
   
  ignorarParada: function (paradaId) {
    var d = Viagens._detalheAtual;
    App.confirmar({
      titulo: 'Marcar como não realizada',
      mensagem: 'Esta parada será marcada como não realizada. Você pode reativá-la depois.',
      textoBotao: 'Marcar como não realizada',
      tipo: 'aviso',
      icone: 'block',
      aoConfirmar: function () {
        sb.from('paradas_viagem').update({ status: 'IGNORADA' }).eq('id', paradaId).then(function () {
          App.toast('Parada marcada como não realizada', 'ok');
          Viagens.abrirDetalhe(d.viagem.id);
        });
      }
    });
  },
   
  reabrirParada: function (paradaId) {
    var d = Viagens._detalheAtual;
    var p = d.paradas.filter(function (x) { return x.id === paradaId; })[0];
    var temAbastecimento = p && p.abastecimentoId;
    var html = '<div class="aviso"><span class="ms">undo</span><div><b>Desfazer esta parada?</b>A parada voltará para o estado pendente.</div></div>';
    if (temAbastecimento) {
      html += '<div class="campo-form"><label style="display:flex;align-items:center;gap:10px;cursor:pointer;text-transform:none">' +
        '<input type="checkbox" id="rpExcluir" checked style="width:auto;transform:scale(1.3)"> Excluir também o abastecimento lançado' +
      '</label></div>';
    }
    App.abrirModal('Desfazer parada', html, function () {
      var excluir = temAbastecimento ? document.getElementById('rpExcluir').checked : false;
      App.fecharModal();
      var promessa = excluir
        ? sb.from('abastecimentos').delete().eq('id', p.abastecimentoId)
        : sb.from('abastecimentos').update({ paradaId: null }).eq('id', p.abastecimentoId || '');
      (temAbastecimento ? promessa : Promise.resolve()).then(function () {
        return sb.from('paradas_viagem').update({
          status: 'PENDENTE',
          litrosReal: 0,
          valorReal: 0,
          abastecimentoId: null,
          origemConclusao: null
        }).eq('id', paradaId);
      }).then(function () {
        if (App._painelRaw) App._painelRaw = null;
        App.toast('Parada reaberta', 'ok');
        Viagens.abrirDetalhe(d.viagem.id);
      }).catch(function (e) {
        console.error('CarWay - erro ao reabrir parada:', e);
        App.toast('Erro ao reabrir parada', 'erro');
      });
    }, 'Desfazer');
  },
  /* =========================================================
     LANÇAR AGORA (atalhos vinculados à viagem)
     ========================================================= */
  lancarAbastecimentoViagem: function (viagemId, veiculoId) {
    window.CARWAY_VIAGEM_HINT = viagemId;
    App.irParaFormAbastecimento(null, veiculoId);
  },
  lancarDespesaViagem: function (viagemId, veiculoId, categoriaPre) {
    var icones = { 'Alimentação': 'restaurant', 'Hospedagem': 'hotel', 'Pedágio': 'toll', 'Combustível': 'local_gas_station', 'Estacionamento': 'local_parking', 'Lavagem': 'local_car_wash', 'Manutenção': 'build', 'Multa': 'gavel', 'Outros': 'receipt_long' };
    var cores = { 'Alimentação': '#22c55e', 'Hospedagem': '#a78bfa', 'Pedágio': '#f59e0b', 'Combustível': '#ef4444', 'Estacionamento': '#3b82f6', 'Lavagem': '#22d3ee', 'Manutenção': '#f59e0b', 'Multa': '#ef4444', 'Outros': '#94a3b8' };
    var categorias = ['Alimentação', 'Hospedagem', 'Pedágio', 'Estacionamento', 'Lavagem', 'Manutenção', 'Multa', 'Outros'];
    var v = Viagens.lista.filter(function (x) { return x.id === viagemId; })[0] || (Viagens._detalheAtual ? Viagens._detalheAtual.viagem : {});
    var tituloViagem = v.titulo || (v.origem + ' → ' + v.destino);

    var chipsCat = categorias.map(function (c) {
      var sel = c === categoriaPre;
      var cor = cores[c] || '#94a3b8';
      return '<button type="button" data-cat="' + c + '" onclick="Viagens._selCatDespesa(this)" style="' +
        'display:flex;align-items:center;gap:6px;padding:9px 13px;border-radius:99px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;' +
        'background:' + (sel ? cor + '26' : 'var(--card,#16213b)') + ';border:1.5px solid ' + (sel ? cor : 'var(--linha,#26365c)') + ';color:' + (sel ? cor : 'var(--txt,#e8eefc)') + '">' +
        '<span class="ms" style="font-size:15px;color:' + cor + '">' + (icones[c] || 'receipt_long') + '</span>' + c +
      '</button>';
    }).join('');

    var html =
      '<div style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.35);border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:13px;color:#bfdbfe">' +
        '<span class="ms" style="font-size:16px;vertical-align:middle;margin-right:4px">luggage</span>' +
        'Vinculado à viagem: <b>' + App.esc(tituloViagem) + '</b>' +
      '</div>' +
      '<div class="campo-form"><label>Categoria</label>' +
        '<div id="chipsCatDespesa" style="display:flex;gap:8px;flex-wrap:wrap">' + chipsCat + '</div>' +
        '<input type="hidden" id="dvCategoria" value="' + App.esc(categoriaPre) + '">' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Valor (R$)</label><input type="number" id="dvValor" step="0.01" placeholder="0,00"></div>' +
        '<div class="campo-form"><label>Data</label><input type="date" id="dvData" value="' + App.hojeISO() + '"></div>' +
      '</div>' +
      '<div class="campo-form"><label>Local <small style="text-transform:none;color:var(--txt2);font-weight:400">(opcional)</small></label><input type="text" id="dvLocal" placeholder="Cidade / local"></div>' +
      '<div class="campo-form"><label>Descrição <small style="text-transform:none;color:var(--txt2);font-weight:400">(opcional)</small></label><input type="text" id="dvDesc" placeholder="Ex.: almoço na rodovia"></div>';

    App.abrirModal('Nova despesa', html, function () {
      var valor = Number(document.getElementById('dvValor').value) || 0;
      if (valor <= 0) { App.toast('Informe o valor', 'erro'); return; }
      var reg = {
        id: 'DES_' + App.uid(),
        organizacaoId: orgAtual.id,
        usuarioId: usuarioAtual.id,
        veiculoId: veiculoId,
        viagemId: viagemId,
        categoria: document.getElementById('dvCategoria').value,
        valor: valor,
        data: document.getElementById('dvData').value,
        local: document.getElementById('dvLocal').value.trim(),
        descricao: document.getElementById('dvDesc').value.trim()
      };
      App.fecharModal();
      sb.from('despesas').insert(reg).then(function (r) {
        if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
        App.toast('Despesa registrada!', 'ok');
        if (Viagens._detalheAtual && Viagens._detalheAtual.viagem.id === viagemId) Viagens.abrirDetalhe(viagemId);
      });
    }, 'Salvar');
  },
  _selCatDespesa: function (el) {
    document.getElementById('dvCategoria').value = el.getAttribute('data-cat');
    var cores = { 'Alimentação': '#22c55e', 'Hospedagem': '#a78bfa', 'Pedágio': '#f59e0b', 'Combustível': '#ef4444', 'Estacionamento': '#3b82f6', 'Lavagem': '#22d3ee', 'Manutenção': '#f59e0b', 'Multa': '#ef4444', 'Outros': '#94a3b8' };
    var todos = document.querySelectorAll('#chipsCatDespesa button');
    for (var j = 0; j < todos.length; j++) {
      var cat = todos[j].getAttribute('data-cat');
      var cor = cores[cat] || '#94a3b8';
      var sel = todos[j] === el;
      todos[j].style.background = sel ? cor + '26' : 'var(--card,#16213b)';
      todos[j].style.borderColor = sel ? cor : 'var(--linha,#26365c)';
      todos[j].style.color = sel ? cor : 'var(--txt,#e8eefc)';
    }
  },

  /* =========================================================
     ORÇAMENTO
     ========================================================= */
  formOrcamento: function (id) {
    var d = Viagens._detalheAtual;
    var v = (d && d.viagem && d.viagem.id === id) ? d.viagem : null;
    if (!v) return;
    var html =
      '<div class="campo-form"><label>Combustível</label><input type="number" id="orComb" step="0.01" value="' + (v.combustivelPrev || '') + '"></div>' +
      '<div class="campo-form"><label>Pedágio</label><input type="number" id="orPed" step="0.01" value="' + (v.pedagioPrev || '') + '"></div>' +
      '<div class="campo-form"><label>Alimentação</label><input type="number" id="orAlim" step="0.01" value="' + (v.alimentacaoPrev || '') + '"></div>' +
      '<div class="campo-form"><label>Hospedagem</label><input type="number" id="orHosp" step="0.01" value="' + (v.hospedagemPrev || '') + '"></div>' +
      '<div class="campo-form"><label>Outros</label><input type="number" id="orOutros" step="0.01" value="' + (v.outrosPrev || '') + '"></div>';
    App.abrirModal('Orçamento da viagem', html, function () {
      var comb = Number(document.getElementById('orComb').value) || 0;
      var ped = Number(document.getElementById('orPed').value) || 0;
      var alim = Number(document.getElementById('orAlim').value) || 0;
      var hosp = Number(document.getElementById('orHosp').value) || 0;
      var out = Number(document.getElementById('orOutros').value) || 0;
      var reg = {
        combustivelPrev: comb, pedagioPrev: ped, alimentacaoPrev: alim, hospedagemPrev: hosp, outrosPrev: out,
        totalPrev: Math.round((comb + ped + alim + hosp + out) * 100) / 100
      };
      App.fecharModal();
      sb.from('viagens').update(reg).eq('id', id).then(function (r) {
        if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
        App.toast('Orçamento atualizado', 'ok');
        Viagens.abrirDetalhe(id);
      });
    }, 'Salvar orçamento');
  },

  /* CORRIGIDO (6.3): agora recebe os valores REAIS já separados por
     categoria (realizado.pedagio, .alimentacao, .hospedagem, .outros)
     em vez de recalcular tudo junto e jogar em "Outros". Cada barra
     agora cresce com o valor certo. */
  renderOrcado: function (v, realizado) {
  var prev = {
    combustivel: Number(v.combustivelPrev) || 0,
    pedagio: Number(v.pedagioPrev) || 0,
    alimentacao: Number(v.alimentacaoPrev) || 0,
    hospedagem: Number(v.hospedagemPrev) || 0,
    outros: Number(v.outrosPrev) || 0
  };

  var totalPrev = prev.combustivel + prev.pedagio + prev.alimentacao + prev.hospedagem + prev.outros;

  if (totalPrev === 0 && realizado.total === 0) {
    return '<div class="orcamento"><div class="orc-titulo"><span class="ms">savings</span> Orçado x Realizado</div>' +
      '<p style="color:var(--txt2);font-size:13px;text-align:center;padding:20px 0">Sem orçamento definido. Toque em "Orçamento" acima.</p></div>';
  }

  var cats = [
    { nome: 'Combustível', cor: '#ef4444', prev: prev.combustivel, real: realizado.combustivel },
    { nome: 'Pedágio', cor: '#f59e0b', prev: prev.pedagio, real: realizado.pedagio },
    { nome: 'Alimentação', cor: '#22c55e', prev: prev.alimentacao, real: realizado.alimentacao },
    { nome: 'Hospedagem', cor: '#a78bfa', prev: prev.hospedagem, real: realizado.hospedagem },
    { nome: 'Outros', cor: '#94a3b8', prev: prev.outros, real: realizado.outros }
  ];

  var html = '<div class="orcamento"><div class="orc-titulo"><span class="ms">savings</span> Orçado x Realizado</div>';

  cats.forEach(function (c) {
    if (c.prev === 0 && c.real === 0) return;

    var pct = c.prev > 0 ? Math.min(100, (c.real / c.prev) * 100) : (c.real > 0 ? 100 : 0);
    var estouro = c.prev > 0 && c.real > c.prev;

    html += '<div class="orc-cat">' +
      '<div class="orc-cat-topo">' +
        '<div class="orc-cat-nome"><span class="cor" style="background:' + c.cor + '"></span>' + c.nome + '</div>' +
        '<div class="orc-cat-val"><b>' + App.moeda(c.real) + '</b>' +
          (c.prev > 0 ? '<small>de ' + App.moeda(c.prev) + '</small>' : '<small>sem orçamento</small>') +
        '</div></div>' +
      '<div class="orc-barra"><i class="' + (estouro ? 'estouro' : '') + '" style="width:' + pct + '%;background:' + c.cor + '"></i></div>' +
    '</div>';
  });

  var dif = realizado.total - totalPrev;
  var linhaFinal = '';

  if (totalPrev > 0) {
    if (realizado.total <= 0) {
      linhaFinal = '<div class="orc-linha destaque neutro"><span>Ainda sem gastos</span><b>' + App.moeda(totalPrev) + '</b></div>' +
        '<small class="orc-nota">Nenhum lançamento registrado nesta viagem. Todo o orçamento previsto continua disponível.</small>';
    } else if (dif > 0) {
      linhaFinal = '<div class="orc-linha destaque ruim"><span>Acima do orçamento</span><b>' + App.moeda(dif) + '</b></div>' +
        '<small class="orc-nota ruim">Você já gastou ' + App.moeda(dif) + ' a mais do que o previsto.</small>';
    } else if (dif < 0) {
      linhaFinal = '<div class="orc-linha destaque bom"><span>Dentro do orçamento</span><b>' + App.moeda(Math.abs(dif)) + '</b></div>' +
        '<small class="orc-nota bom">Ainda restam ' + App.moeda(Math.abs(dif)) + ' do valor previsto.</small>';
    } else {
      linhaFinal = '<div class="orc-linha destaque"><span>Exatamente no previsto</span><b>' + App.moeda(0) + '</b></div>';
    }
  }

  html += '<div class="orc-total">' +
    '<div class="orc-linha"><span>Previsto</span><b>' + App.moeda(totalPrev) + '</b></div>' +
    '<div class="orc-linha"><span>Realizado</span><b>' + App.moeda(realizado.total) + '</b></div>' +
    linhaFinal +
  '</div></div>';

  return html;
},

  itemAbastecimento: function (a) {
    var val = Number(a.valorTotal) || (Number(a.litros) || 0) * (Number(a.precoLitro) || 0);
    return '<div class="card-desp"><div class="cd-topo">' +
      '<div class="cat-ico" style="background:rgba(239,68,68,.15);color:#ef4444"><span class="ms">local_gas_station</span></div>' +
      '<div class="cd-info"><b>' + App.fmtNum(a.litros, 2) + ' L · ' + App.moeda(val) + '</b>' +
      '<small>' + Viagens.fmtData(a.data) + ' · ' + App.fmtNum(a.km) + ' km · ' + App.esc(a.posto || 'Posto') + '</small></div>' +
    '</div></div>';
  },
  itemDespesa: function (d) {
    return '<div class="card-desp"><div class="cd-topo">' +
      '<div class="cat-ico cat-outros"><span class="ms">receipt_long</span></div>' +
      '<div class="cd-info"><b>' + App.esc(d.descricao || d.categoria) + '</b>' +
      '<small>' + Viagens.fmtData(d.data) + ' · ' + App.esc(d.categoria) + (d.local ? ' · ' + App.esc(d.local) : '') + '</small></div>' +
      '<div class="cd-valor">' + App.moeda(d.valor) + '</div></div></div>';
  },
  itemManutencao: function (m) {
    return '<div class="card-desp"><div class="cd-topo">' +
      '<div class="cat-ico cat-manutencao"><span class="ms">build</span></div>' +
      '<div class="cd-info"><b>' + App.esc(m.item || 'Manutenção') + '</b>' +
      '<small>' + Viagens.fmtData(m.data) + ' · ' + App.fmtNum(m.km) + ' km · ' + App.esc(m.oficina || '') + '</small></div>' +
      '<div class="cd-valor">' + App.moeda(m.custo) + '</div></div></div>';
  },

  /* =========================================================
     MAPA DO DETALHE
     CORRIGIDO (print7): removido botão "Refazer" (redundante, já
     existe "Editar" no topo). "Tela cheia" e "Postos" ficam lado a
     lado; "Exportar viagem em PDF" fica abaixo, centralizado e em
     largura total.
     ========================================================= */
  _mapaDetalhe: null,
  _montarMapaDetalhe: function (v) {
    var container = document.getElementById('blocoMapaViagemDetalhe');
    if (!container) return;

    var botaoExportar =
      '<div class="form-acoes-viagem" style="margin-top:10px">' +
        '<button class="btn-novo-sec btn-bloco-full" style="justify-content:center" onclick="Viagens.exportarPDFViagem(\'' + v.id + '\')"><span class="ms" style="color:#a78bfa">picture_as_pdf</span> Exportar viagem em PDF</button>' +
      '</div>';

    if (!v.rota) { container.innerHTML = botaoExportar; return; }
    var r;
    try { r = JSON.parse(v.rota); } catch (e) { container.innerHTML = botaoExportar; return; }
    if (!r || !r.polyline) { container.innerHTML = botaoExportar; return; }

    container.innerHTML =
      '<h2 class="secao-titulo"><span class="ms">map</span> Mapa da rota</h2>' +
      '<div id="mapaDetalheViagem" style="height:260px;border-radius:16px;border:1px solid var(--linha,#26365c);overflow:hidden;margin-bottom:10px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<button class="btn-novo-sec" style="justify-content:center" onclick="Viagens.mapaDetalheTelaCheia()"><span class="ms">fullscreen</span> Tela cheia</button>' +
        '<button class="btn-novo-sec" style="justify-content:center" onclick="Viagens.abrirBuscaPostos()"><span class="ms" style="color:#ef4444">local_gas_station</span> Postos</button>' +
      '</div>' +
      botaoExportar;

    setTimeout(function () {
      var el = document.getElementById('mapaDetalheViagem');
      if (!el || typeof L === 'undefined') return;
      if (Viagens._mapaDetalhe) { try { Viagens._mapaDetalhe.remove(); } catch (e) {} Viagens._mapaDetalhe = null; }
      Viagens._mapaDetalhe = L.map('mapaDetalheViagem', { zoomControl: true, attributionControl: false }).setView([-15.7939, -47.8828], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(Viagens._mapaDetalhe);
      var coords = Viagens._decodificarPolyline(r.polyline || '');
      if (!coords.length) return;
      var linha = L.polyline(coords, { color: '#3b82f6', weight: 5, opacity: 0.9 }).addTo(Viagens._mapaDetalhe);
      if (r.origem) L.marker([r.origem.lat, r.origem.lon], { icon: Viagens._iconePinPosto('#22c55e', null) }).addTo(Viagens._mapaDetalhe).bindPopup('<b>Origem</b>');
      if (r.destino) L.marker([r.destino.lat, r.destino.lon], { icon: Viagens._iconePinPosto('#ef4444', null) }).addTo(Viagens._mapaDetalhe).bindPopup('<b>Destino</b>');
      var d = Viagens._detalheAtual;
      (d.paradas || []).forEach(function (p) {
        if (!p.latitude || !p.longitude) return;
        var cor = String(p.status).toUpperCase() === 'CONCLUIDA' ? '#22c55e' : (p.antecipada ? '#f59e0b' : (p.trecho === 'VOLTA' ? '#a78bfa' : '#3b82f6'));
        L.marker([p.latitude, p.longitude], { icon: Viagens._iconePinPosto(cor, p.ordem) })
          .addTo(Viagens._mapaDetalhe).bindPopup('<b>' + App.esc(p.postoNome || ('Parada ' + p.ordem)) + '</b>');
      });
      setTimeout(function () {
        Viagens._mapaDetalhe.invalidateSize();
        try { Viagens._mapaDetalhe.fitBounds(linha.getBounds(), { padding: [24, 24] }); } catch (e) {}
      }, 150);
    }, 120);
  },
  mapaDetalheTelaCheia: function () {
    if (Viagens._mapaDetalhe) Viagens._mapaDetalhe.invalidateSize();
    var el = document.getElementById('mapaDetalheViagem');
    if (el && el.requestFullscreen) el.requestFullscreen();
    else App.toast('Tela cheia não suportada neste navegador', 'erro');
  },

  /* =========================================================
     EXPORTAR PDF DE UMA VIAGEM
     ========================================================= */
  exportarPDFViagem: function (viagemId) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      App.toast('Biblioteca de PDF não carregada. Atualize a página (Ctrl+F5).', 'erro');
      return;
    }
    var d = Viagens._detalheAtual;
    if (!d || d.viagem.id !== viagemId) return;
    var v = d.viagem;
    var veiculo = d.veiculos.filter(function (x) { return x.id === v.veiculoId; })[0];
    var totComb = 0; d.abastecimentos.forEach(function (a) { totComb += Number(a.valorTotal) || (Number(a.litros)||0)*(Number(a.precoLitro)||0); });
    var totDesp = 0; d.despesas.forEach(function (x) { totDesp += Number(x.valor) || 0; });
    var totManut = 0; d.manutencoes.forEach(function (x) { totManut += Number(x.custo) || 0; });
    var total = totComb + totDesp + totManut;
    var kmReal = v.kmFinal > 0 ? (Number(v.kmFinal) - Number(v.kmInicial)) : Number(v.distancia);
    var custoKm = kmReal > 0 ? total / kmReal : 0;
    var litros = 0; d.abastecimentos.forEach(function (a) { litros += Number(a.litros) || 0; });

    var realPedagio = 0, realAlim = 0, realHosp = 0, realOutros = 0;
    d.despesas.forEach(function (x) {
      var val = Number(x.valor) || 0;
      if (x.categoria === 'Alimentação') realAlim += val;
      else if (x.categoria === 'Hospedagem') realHosp += val;
      else if (x.categoria === 'Pedágio') realPedagio += val;
      else realOutros += val;
    });
    realOutros += totManut;

    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var tituloViagem = v.titulo || (v.origem + ' → ' + v.destino);
    var subtitulo = v.origem + ' → ' + v.destino + ' - ' +
      (String(v.idaVolta).toUpperCase() === 'SIM' ? 'ida e volta' : 'só ida') + ' - ' +
      Viagens.fmtData(v.dataInicio) + (v.dataFim ? ' a ' + Viagens.fmtData(v.dataFim) : '') +
      (veiculo ? ' - ' + veiculo.nome + (veiculo.placa ? ' ' + veiculo.placa : '') : '');

    doc.setFontSize(16);
    doc.text('Relatório de Viagem', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(subtitulo, 14, 22);
    doc.setTextColor(0);

    doc.autoTable({
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 9 },
      head: [['Distância', 'Combustível', 'Gasto total', 'Custo por km']],
      body: [[App.fmtNum(kmReal) + ' km', App.fmtNum(litros, 1) + ' L', App.moeda(total), App.moeda(custoKm)]]
    });
    var y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.text('Orçado x Realizado', 14, y);
    var linhasOrc = [
      ['Combustível', App.moeda(v.combustivelPrev || 0), App.moeda(totComb), App.moeda(totComb - (v.combustivelPrev || 0))],
      ['Pedágio', App.moeda(v.pedagioPrev || 0), App.moeda(realPedagio), App.moeda(realPedagio - (v.pedagioPrev || 0))],
      ['Alimentação', App.moeda(v.alimentacaoPrev || 0), App.moeda(realAlim), App.moeda(realAlim - (v.alimentacaoPrev || 0))],
      ['Hospedagem', App.moeda(v.hospedagemPrev || 0), App.moeda(realHosp), App.moeda(realHosp - (v.hospedagemPrev || 0))],
      ['Outros', App.moeda(v.outrosPrev || 0), App.moeda(realOutros), App.moeda(realOutros - (v.outrosPrev || 0))]
    ];
    var totalPrevGeral = (v.combustivelPrev||0)+(v.pedagioPrev||0)+(v.alimentacaoPrev||0)+(v.hospedagemPrev||0)+(v.outrosPrev||0);
    linhasOrc.push(['TOTAL', App.moeda(totalPrevGeral), App.moeda(total), App.moeda(total - totalPrevGeral)]);
    doc.autoTable({
      startY: y + 3,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [59, 130, 246] },
      head: [['Categoria', 'Previsto', 'Realizado', 'Diferença']],
      body: linhasOrc,
      didParseCell: function (dataCell) {
        if (dataCell.column.index === 3 && dataCell.row.section === 'body') {
          var txt = String(dataCell.cell.raw || '');
          if (txt.indexOf('-') === 0) dataCell.cell.styles.textColor = [34, 197, 94];
          else if (txt !== 'R$ 0,00' && txt !== '-') dataCell.cell.styles.textColor = [239, 68, 68];
        }
        if (dataCell.row.index === linhasOrc.length - 1) dataCell.cell.styles.fontStyle = 'bold';
      }
    });
    y = doc.lastAutoTable.finalY + 10;

    if (d.paradas && d.paradas.length) {
      if (y > 240) { doc.addPage(); y = 16; }
      doc.setFontSize(12);
      doc.text('Paradas planejadas', 14, y);
      doc.autoTable({
        startY: y + 3,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [167, 139, 250] },
        head: [['#', 'KM', 'Posto sugerido', 'Endereço', 'Status']],
        body: d.paradas.map(function (p) {
          var statusTxt = p.status || 'PENDENTE';
          if (p.antecipada) statusTxt += ' (antecipada ' + Math.round((p.kmOriginalPrevisto - p.kmPrevisto)*10)/10 + 'km)';
          return ['#' + p.ordem, App.fmtNum(p.kmPrevisto), p.postoNome || '—', p.postoEndereco || '—', statusTxt];
        })
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    if (d.abastecimentos.length) {
      if (y > 250) { doc.addPage(); y = 16; }
      doc.setFontSize(12);
      doc.text('Abastecimentos', 14, y);
      doc.autoTable({
        startY: y + 3,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [239, 68, 68] },
        head: [['Data', 'Litros', 'Km', 'Posto', 'Valor']],
        body: d.abastecimentos.map(function (a) {
          return [Viagens.fmtData(a.data), App.fmtNum(a.litros, 2), App.fmtNum(a.km), a.posto || '—', App.moeda(a.valorTotal)];
        })
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    if (d.despesas.length) {
      if (y > 250) { doc.addPage(); y = 16; }
      doc.setFontSize(12);
      doc.text('Despesas', 14, y);
      doc.autoTable({
        startY: y + 3,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [34, 197, 94] },
        head: [['Data', 'Categoria', 'Descrição', 'Local', 'Valor']],
        body: d.despesas.map(function (x) {
          return [Viagens.fmtData(x.data), x.categoria || '', x.descricao || '', x.local || '—', App.moeda(x.valor)];
        })
      });
    }

    var totalPaginas = doc.internal.getNumberOfPages();
    for (var i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('Gerado pelo CarWay em ' + new Date().toLocaleString('pt-BR'), 14, 290);
      doc.text('Página ' + i + ' de ' + totalPaginas, 196, 290, { align: 'right' });
    }

    var nomeArquivo = 'Viagem_' + tituloViagem.replace(/[^a-zA-Z0-9]/g, '') + '_' + App.hojeISO() + '.pdf';
    Viagens._finalizarPDF(doc, nomeArquivo);
  },

  _finalizarPDF: function (doc, filename) {
    var blob = doc.output('blob');
    var url = URL.createObjectURL(blob);
    Viagens._ultimoPdfBlob = blob;
    Viagens._ultimoPdfNome = filename;
    var tamanhoKB = Math.max(1, Math.round(blob.size / 1024));
    var html =
      '<div style="background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);border-radius:12px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">' +
        '<span class="ms" style="color:#22c55e;font-size:24px">check_circle</span>' +
        '<div><b style="display:block;font-size:13px">' + App.esc(filename) + '</b>' +
        '<small style="color:var(--txt2)">Documento gerado (' + tamanhoKB + ' KB).</small></div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
        '<button class="btn-novo" style="justify-content:center" onclick="Viagens._abrirEImprimirPDF()"><span class="ms">visibility</span> Abrir e imprimir</button>' +
        '<button class="btn-novo-sec" style="justify-content:center" onclick="Viagens._salvarPDFAparelho()"><span class="ms" style="color:#60a5fa">download</span> Salvar no aparelho</button>' +
        '<button class="btn-novo-sec" style="justify-content:center" onclick="Viagens._compartilharPDF()"><span class="ms" style="color:#a78bfa">share</span> Compartilhar / Drive</button>' +
      '</div>';
    App.abrirModal('PDF pronto', html, null);
    Viagens._ultimoPdfUrl = url;
  },
  _abrirEImprimirPDF: function () {
    if (!Viagens._ultimoPdfUrl) return;
    var win = window.open(Viagens._ultimoPdfUrl, '_blank');
    if (win) {
      setTimeout(function () { try { win.focus(); win.print(); } catch (e) {} }, 600);
    }
  },
  _salvarPDFAparelho: function () {
    if (!Viagens._ultimoPdfUrl) return;
    var a = document.createElement('a');
    a.href = Viagens._ultimoPdfUrl;
    a.download = Viagens._ultimoPdfNome || 'carway.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    App.toast('PDF salvo no aparelho', 'ok');
  },
  _compartilharPDF: function () {
    if (!Viagens._ultimoPdfBlob) return;
    var file = new File([Viagens._ultimoPdfBlob], Viagens._ultimoPdfNome || 'carway.pdf', { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'CarWay', text: 'Relatório CarWay' }).catch(function () {});
      return;
    }
    window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener');
    App.toast('Compartilhamento direto não suportado neste navegador. Salve o PDF e envie manualmente ao Drive.', 'ok');
  },

  /* =========================================================
     ENCERRAR / INICIAR
     ========================================================= */
  abrirEncerrar: function (id) {
    sb.from('viagens').select('*').eq('id', id).single().then(function (r) {
      if (r.error || !r.data) { App.toast('Viagem não encontrada', 'erro'); return; }
      Viagens.renderEncerrar(r.data);
    });
  },
  renderEncerrar: function (v) {
  var dataHoje = App.hojeISO();
  var ehIniciar = v.status === 'planejada';
  var distanciaPlanejada = Number(v.distancia) || 0;

  var resumo = ehIniciar
    ? '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">' +
        '<span style="color:var(--txt2)">Distância planejada</span><b>' + App.fmtNum(distanciaPlanejada) + ' km</b>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-top:1px solid var(--linha);margin-top:4px;padding-top:8px">' +
        '<span style="color:var(--txt2)">Percurso</span><b>' + (String(v.idaVolta).toUpperCase() === 'SIM' ? 'Ida e volta' : 'Somente ida') + '</b>' +
      '</div>'
    : '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">' +
        '<span style="color:var(--txt2)">KM ao sair</span><b>' + App.fmtNum(v.kmInicial || 0) + ' km</b>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">' +
        '<span style="color:var(--txt2)">Distância planejada</span><b>' + App.fmtNum(distanciaPlanejada) + ' km</b>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-top:1px solid var(--linha);margin-top:4px;padding-top:8px">' +
        '<span style="color:var(--txt2)">Distância percorrida</span><b id="encDist">—</b>' +
      '</div>';

  var html =
    '<h2 class="form-titulo">' + (ehIniciar ? 'Iniciar viagem' : 'Encerrar viagem') + '</h2>' +
    '<div class="aviso info" style="margin-bottom:18px">' +
      '<span class="ms">' + (ehIniciar ? 'play_arrow' : 'stop_circle') + '</span>' +
      '<div><b>' + App.esc(v.titulo || (v.origem + ' → ' + v.destino)) + '</b>' +
      (ehIniciar ? 'Registre o KM do painel antes de sair.' : 'Registre o KM do painel ao chegar.') + '</div>' +
    '</div>' +
    '<div class="campo-form"><label>KM do painel ' + (ehIniciar ? 'ao sair' : 'ao voltar') + '</label>' +
      '<input type="number" id="encKm" placeholder="0" value="' + (v.kmInicial || '') + '" oninput="Viagens.calcEncerrar(' + (v.kmInicial || 0) + ')">' +
    '</div>' +
    '<div class="campo-form"><label>Data ' + (ehIniciar ? 'de saída' : 'de retorno') + '</label>' +
      '<input type="date" id="encData" value="' + (ehIniciar ? (v.dataInicio || dataHoje) : (v.dataFim || dataHoje)) + '">' +
    '</div>' +
    '<div style="background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;margin-bottom:16px">' + resumo + '</div>' +
    (ehIniciar
      ? '<label class="switch" style="margin-bottom:16px"><span>Abrir navegação ao iniciar</span><input type="checkbox" id="encAbrirNav" checked></label>'
      : '') +
    '<div class="form-acoes-viagem">' +
      '<button class="btn-cancelar-form" onclick="App.irPara(\'viagens\')"><span class="ms">close</span> Cancelar</button>' +
      '<button class="btn-novo btn-bloco-full" onclick="Viagens.confirmarEncerrar(\'' + v.id + '\',' + ehIniciar + ')">' +
        '<span class="ms">' + (ehIniciar ? 'play_arrow' : 'flag') + '</span> ' + (ehIniciar ? 'Iniciar viagem' : 'Encerrar viagem') +
      '</button>' +
    '</div>';

  document.getElementById('formEncerrarViagemContainer').innerHTML = html;

  if (!ehIniciar) Viagens.calcEncerrar(v.kmInicial);
},
   
  calcEncerrar: function (kmIni) {
    var km = Number(document.getElementById('encKm').value) || 0;
    var el = document.getElementById('encDist');
    if (!el) return;
    if (km > kmIni && kmIni > 0) { el.textContent = App.fmtNum(km - kmIni) + ' km'; el.style.color = '#86efac'; }
    else if (km > 0 && km <= kmIni) { el.textContent = 'KM inválido'; el.style.color = '#fca5a5'; }
    else { el.textContent = '—'; el.style.color = ''; }
  },
confirmarEncerrar: function (id, ehIniciar) {
  var km = Number(document.getElementById('encKm').value) || 0;
  var data = document.getElementById('encData').value;

  if (km <= 0) { App.toast('Informe o KM', 'erro'); return; }

  var elNav = document.getElementById('encAbrirNav');
  var abrirNavegacao = ehIniciar && elNav ? elNav.checked : false;

  var reg = { id: id };

  if (ehIniciar) { reg.status = 'andamento'; reg.kmInicial = km; reg.dataInicio = data; }
  else { reg.status = 'concluida'; reg.kmFinal = km; reg.dataFim = data; }

  sb.from('viagens').update(reg).eq('id', id).then(function (r) {
    if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }

    if (App._painelRaw) App._painelRaw = null;
    App.toast(ehIniciar ? 'Viagem iniciada!' : 'Viagem concluída!', 'ok');

    if (abrirNavegacao) {
      Viagens.abrirNavegacaoDaViagem(id);
      return;
    }

    App.irPara('viagens');
  });
},

   abrirNavegacaoDaViagem: function (viagemId) {
  Promise.all([
    sb.from('viagens').select('rota,titulo,origem,destino').eq('id', viagemId).single(),
    sb.from('paradas_viagem').select('postoLat,postoLon,postoNome,ordem,status').eq('viagemId', viagemId).order('ordem')
  ]).then(function (resultados) {
    var rViagem = resultados[0];
    var rParadas = resultados[1];

    if (rViagem.error || !rViagem.data || !rViagem.data.rota) {
      App.toast('Rota não encontrada', 'erro');
      App.irPara('viagens');
      return;
    }

    var rota;

    try { rota = JSON.parse(rViagem.data.rota); }
    catch (e) { App.toast('Rota inválida', 'erro'); App.irPara('viagens'); return; }

    if (!rota.origem || !rota.destino) {
      App.toast('Rota sem coordenadas', 'erro');
      App.irPara('viagens');
      return;
    }

    Viagens.plano.origem = rota.origem;
    Viagens.plano.destino = rota.destino;
    Viagens._paradasParaNavegacao = (rParadas.data || []).filter(function (p) {
      return p.postoLat && p.postoLon && String(p.status).toUpperCase() !== 'IGNORADA';
    });

    Viagens._continuarAbrirNoMaps();
    setTimeout(function () { App.irParaDetalheViagem(viagemId); }, 1200);
  }).catch(function (e) {
    console.error('CarWay - erro ao abrir navegação:', e);
    App.irPara('viagens');
  });
},

_urlMapsComParadas: function (origem, destino) {
  var url = 'https://www.google.com/maps/dir/?api=1' +
    '&origin=' + encodeURIComponent(origem.lat + ',' + origem.lon) +
    '&destination=' + encodeURIComponent(destino.lat + ',' + destino.lon) +
    '&travelmode=driving';

  var paradas = Viagens._paradasParaNavegacao || [];

  var pontos = paradas.slice(0, 9).map(function (p) {
    return p.postoLat + ',' + p.postoLon;
  });

  if (pontos.length) {
    url += '&waypoints=' + encodeURIComponent(pontos.join('|'));
  }

  return url;
},
  /* =========================================================
     EXCLUIR
     ========================================================= */
  excluir: function (id) {
    var v = Viagens.lista.filter(function (x) { return x.id === id; })[0] ||
      (Viagens._detalheAtual && Viagens._detalheAtual.viagem.id === id ? Viagens._detalheAtual.viagem : {});
    var titulo = v.titulo || (v.origem + ' → ' + v.destino);
    App.confirmar({
      titulo: 'Excluir viagem',
      mensagem: 'A viagem <b>' + App.esc(titulo) + '</b> será excluída permanentemente. ' +
        'Os abastecimentos, despesas e manutenções vinculados a ela <b>NÃO</b> serão apagados (ficarão como gastos do dia a dia).',
      textoBotao: 'Excluir viagem',
      tipo: 'perigo',
      icone: 'luggage',
      aoConfirmar: function () {
        sb.from('viagens').delete().eq('id', id).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Viagem excluída', 'ok');
          App.irPara('viagens');
        });
      }
    });
  },

  fmtData: function (s) {
    if (!s) return '—';
    var p = String(s).substring(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s;
  }
};
