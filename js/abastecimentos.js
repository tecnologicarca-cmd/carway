/* APP_VERSION: v3.6 - multi-energeticos + fila offline */
/* =====================================================================
   CARWAY - ABASTECIMENTOS
   v3.2 (esta versao)
   - LAYOUT (mobile): "Valor total" agora fica sozinho em sua prÃ³pria
     linha (campo largo, mais fÃ¡cil de tocar no celular). Logo abaixo
     dele fica a prÃ©via de cÃ¡lculo (litros x preÃ§o = total), e logo
     abaixo o campo "Posto / ponto de recarga" â€” antes Valor e Posto
     ficavam lado a lado, apertados demais em telas pequenas.
   - CORRIGIDO: o FORMULÃRIO de abastecimento agora tambÃ©m escuta a
     barra de veÃ­culo GLOBAL (App.aoTrocarVeiculoAtivo). Antes, sÃ³ a
     LISTA reagia a trocas de veÃ­culo no topo â€” se o usuÃ¡rio estivesse
     com o formulÃ¡rio "Novo/Editar abastecimento" aberto e trocasse o
     veÃ­culo pelos Ã­cones do topo, o formulÃ¡rio continuava mostrando o
     veÃ­culo antigo. Agora, ao trocar o veÃ­culo ativo com o formulÃ¡rio
     aberto, o campo "VeÃ­culo" do formulÃ¡rio Ã© atualizado automaticamente
     (e o combustÃ­vel/unidades resincronizam juntos, como jÃ¡ acontecia
     ao trocar manualmente pelo select).
   - CORRIGIDO (cores): vÃ¡rios Ã­cones ainda apareciam em tom de azul/
     azul-claro por herdarem a cor padrÃ£o do CSS, sem cor prÃ³pria
     definida. Agora TODOS os Ã­cones usados nesta pÃ¡gina tÃªm cor
     explÃ­cita e distinta:
       â›½ bomba de combustÃ­vel -> sempre vermelho (regra do app)
       ðŸ“ localizaÃ§Ã£o (alfinete do posto) -> ciano
       ðŸ  dia a dia -> verde | ðŸ§³ viagem especÃ­fica -> roxo
       âœï¸ editar -> azul | ðŸ—‘ï¸ excluir -> vermelho
       ðŸ’° total -> azul | ðŸ§³ em viagens -> roxo | ðŸ  dia a dia -> verde
       â±ï¸ mÃ©dia -> Ã¢mbar
     AlÃ©m disso, o botÃ£o "Buscar postos" jÃ¡ existente na pÃ¡gina (markup
     estÃ¡tico, fora do nosso controle direto) agora tem o Ã­cone da
     bomba forÃ§ado para vermelho via JavaScript no momento em que nos
     conectamos a ele â€” corrigindo o azul residual que vinha do HTML
     original.

   v3.1
   - BotÃ£o duplicado corrigido (conecta no botÃ£o jÃ¡ existente, sem criar outro)
   - "HÃ­brido" removido da lista de combustÃ­vel do formulÃ¡rio
   - Filtro de perÃ­odo (MÃªs/Ano/Tudo)
   - PrÃ©via de cÃ¡lculo oculta quando vazia
   - Medidor visual (ponteiro) para nÃ­vel do tanque + 3 servidores Overpass

   v3.0 / v2.0 â€” ver changelog nas versÃµes anteriores.
   ===================================================================== */
var Abastecimentos = {
  lista: [],
  filtro: 'todos',
  editando: null,
  veiculosPorId: {},
  veiculos: [],

  _form: {
    tipoLancamento: 'diaadia',
    nivelTanque: 100,
    viagensDoVeiculo: [],
    energetico: 'Gasolina'
  },

  filtroPeriodo: { modo: 'mes', ano: 0, mes: 0 },

  _listenerVeiculoRegistrado: false,

  /* Registra (uma Ãºnica vez) um ouvinte na barra de veÃ­culo GLOBAL.
     Este ÃšNICO callback agora atualiza tanto a LISTA (se estiver
     ativa) quanto o FORMULÃRIO (se estiver aberto) â€” antes sÃ³ a lista
     era avisada. */
  _registrarListenerVeiculoGlobal: function () {
    if (Abastecimentos._listenerVeiculoRegistrado) return;
    if (typeof App === 'undefined' || !App.aoTrocarVeiculoAtivo) return;
    Abastecimentos._listenerVeiculoRegistrado = true;
    App.aoTrocarVeiculoAtivo(function (veiculoId) {
      var pgLista = document.getElementById('pg-abastecimentos');
      if (pgLista && pgLista.classList.contains('ativa')) {
        Abastecimentos.renderKpis();
        Abastecimentos.renderLista();
      }
      var pgForm = document.getElementById('pg-abastecimento-form');
      if (pgForm && pgForm.classList.contains('ativa')) {
        Abastecimentos._sincronizarFormComVeiculoGlobal(veiculoId);
      }
    });
  },

  /* Atualiza o SELECT de veÃ­culo do formulÃ¡rio (se ele existir e o
     veÃ­culo global escolhido estiver na lista de veÃ­culos do form),
     e dispara a mesma rotina de troca manual (resincroniza combustÃ­vel,
     unidades e viagens vinculadas). Se o veÃ­culo escolhido nÃ£o existir
     na lista (raro) ou for "Todos" (null), nÃ£o faz nada â€” o formulÃ¡rio
     precisa sempre ter UM veÃ­culo selecionado. */
  _sincronizarFormComVeiculoGlobal: function (veiculoId) {
    if (!veiculoId) return;
    var sel = document.getElementById('abVeiculo');
    if (!sel) return;
    var existe = Abastecimentos.veiculos.some(function (v) { return v.id === veiculoId; });
    if (!existe) return;
    if (sel.value === veiculoId) return; /* jÃ¡ estÃ¡ sincronizado */
    sel.value = veiculoId;
    Abastecimentos.trocarVeiculoForm();
  },

  /* =========================================================
     LISTA
     ========================================================= */
  carregarLista: function () {
    var el = document.getElementById('listaAbastecimentos');
    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';

    Abastecimentos._registrarListenerVeiculoGlobal();

    Promise.all([
      sb.from('abastecimentos').select('*').eq('organizacaoId', orgAtual.id).order('data', { ascending: false }),
      sb.from('veiculos').select('id, nome, placa, tipo, cor, combustivel, energeticos, plugIn, tanque, capacidadeGnv, capacidadeBateria').eq('organizacaoId', orgAtual.id)
    ]).then(function (r) {
      if (r[0].error) {
        el.innerHTML = '<div class="vazio-veiculo"><p>Erro ao carregar.</p></div>';
        return;
      }
      Abastecimentos.lista = r[0].data || [];

      Abastecimentos.veiculosPorId = {};
      (r[1].data || []).forEach(function (v) { Abastecimentos.veiculosPorId[v.id] = v; });

      var hoje = new Date();
      if (!Abastecimentos.filtroPeriodo.ano) Abastecimentos.filtroPeriodo.ano = hoje.getFullYear();
      if (!Abastecimentos.filtroPeriodo.mes) Abastecimentos.filtroPeriodo.mes = hoje.getMonth() + 1;

      Abastecimentos._garantirFiltroPeriodoContainer();
      Abastecimentos.renderFiltroPeriodo();
      Abastecimentos.renderKpis();
      Abastecimentos.renderLista();
      Abastecimentos._conectarBotaoBuscarPostosExistente();
    });
  },

  _garantirFiltroPeriodoContainer: function () {
    if (document.getElementById('filtroPeriodoAbast')) return;
    var kpis = document.getElementById('kpisAbast');
    if (!kpis || !kpis.parentNode) return;
    var el = document.createElement('div');
    el.id = 'filtroPeriodoAbast';
    kpis.parentNode.insertBefore(el, kpis);
  },

  /* Procura o botÃ£o "Buscar postos" JÃ EXISTENTE na pÃ¡gina (markup
     estÃ¡tico do index.html) e: (1) conecta o clique Ã  nossa lÃ³gica
     nova; (2) forÃ§a a cor do ÃCONE da bomba dentro dele para vermelho
     â€” porque esse botÃ£o nÃ£o Ã© gerado por nÃ³s, e o HTML original nÃ£o
     tinha nenhuma cor explÃ­cita (herdava o azul padrÃ£o do CSS). */
  _conectarBotaoBuscarPostosExistente: function () {
    var pg = document.getElementById('pg-abastecimentos');
    if (!pg) return;
    var botoes = pg.querySelectorAll('button');
    for (var i = 0; i < botoes.length; i++) {
      var txt = (botoes[i].textContent || '').trim().toLowerCase();
      if (txt.indexOf('buscar postos') > -1 || txt === 'postos') {
        botoes[i].onclick = function (e) {
          if (e) e.preventDefault();
          Abastecimentos.abrirBuscaPostos();
        };
        var icone = botoes[i].querySelector('.ms');
        if (icone) icone.style.color = '#ef4444';
      }
    }
  },

  _listaBase: function () {
    var lista = Abastecimentos.lista;
    if (App.veiculoAtivoId) lista = lista.filter(function (a) { return a.veiculoId === App.veiculoAtivoId; });
    lista = lista.filter(function (a) { return Abastecimentos.noPeriodo(a.data); });
    return lista;
  },

  renderKpis: function () {
    var total = 0;
    var totalViagem = 0;
    var totalRotina = 0;
    var quantidades = {};
    var eficiencias = {};
    var lista = Abastecimentos._listaBase();

    lista.forEach(function (a) {
      var valor = Number(a.valorTotal) || ((Number(a.litros) || 0) * (Number(a.precoLitro) || 0));
      var qtd = Number(a.litros) || 0;
      var unidade = a.unidade || Abastecimentos._unidadePorCombustivel(a.combustivel).sigla;
      var energetico = a.combustivel || 'Gasolina';
      total += valor;
      if (a.viagemId) totalViagem += valor; else totalRotina += valor;
      quantidades[unidade] = (quantidades[unidade] || 0) + qtd;

      var dist = Number(a.distanciaCombustivel) || 0;
      if (dist > 0 && qtd > 0) {
        if (!eficiencias[energetico]) eficiencias[energetico] = { soma: 0, qtd: 0, unidade: unidade };
        eficiencias[energetico].soma += dist / qtd;
        eficiencias[energetico].qtd++;
      }
    });

    var resumoQtd = Object.keys(quantidades).map(function (u) {
      return Abastecimentos.fmtNum(quantidades[u], 1) + ' ' + u;
    }).join(' Â· ') || 'Sem quantidade';

    var chavesEff = Object.keys(eficiencias);
    var mediaTxt = 'â€”';
    var mediaSub = 'Sem mÃ©dia';
    if (chavesEff.length === 1) {
      var e = eficiencias[chavesEff[0]];
      mediaTxt = (e.soma / e.qtd).toFixed(2);
      mediaSub = 'km/' + e.unidade + ' Â· ' + chavesEff[0];
    } else if (chavesEff.length > 1) {
      mediaTxt = chavesEff.length;
      mediaSub = 'mÃ©dias por energÃ©tico';
    }

    document.getElementById('kpisAbast').innerHTML =
      '<div class="kpi-abast"><span class="ms" style="color:#3b82f6">payments</span><b>' + App.moeda(total) + '</b><span class="lbl">Total Â· ' + App.esc(resumoQtd) + '</span></div>' +
      '<div class="kpi-abast roxo"><span class="ms" style="color:#a78bfa">luggage</span><b>' + App.moeda(totalViagem) + '</b><span class="lbl">Em viagens</span></div>' +
      '<div class="kpi-abast verde"><span class="ms" style="color:#22c55e">home</span><b>' + App.moeda(totalRotina) + '</b><span class="lbl">Dia a dia</span></div>' +
      '<div class="kpi-abast amarelo"><span class="ms" style="color:#f59e0b">speed</span><b>' + mediaTxt + '</b><span class="lbl">' + App.esc(mediaSub) + '</span></div>';
  },

  fmtLitros: function (n) {
    n = Number(n) || 0;
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  },

  /* =========================================================
     FILTRO DE PERIODO (MÃªs / Ano / Tudo)
     ========================================================= */
  noPeriodo: function (dataStr) {
    var f = Abastecimentos.filtroPeriodo;
    if (f.modo === 'tudo') return true;
    if (!dataStr) return false;
    var s = String(dataStr);
    if (f.modo === 'ano') return s.substring(0, 4) === String(f.ano);
    return s.substring(0, 7) === (f.ano + '-' + ('0' + f.mes).slice(-2));
  },
  anosDisponiveisPeriodo: function () {
    var set = {};
    Abastecimentos.lista.forEach(function (a) { if (a.data) set[String(a.data).substring(0, 4)] = 1; });
    set[String(new Date().getFullYear())] = 1;
    return Object.keys(set).sort().reverse();
  },
  renderFiltroPeriodo: function () {
    var el = document.getElementById('filtroPeriodoAbast');
    if (!el) return;
    var f = Abastecimentos.filtroPeriodo;
    var anos = Abastecimentos.anosDisponiveisPeriodo();
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
    var estiloNav = 'background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);color:#60a5fa;' +
      'width:36px;height:38px;border-radius:9px;display:grid;place-items:center;cursor:pointer;flex:none';

    var campos;
    if (f.modo === 'mes') {
      campos =
        '<button style="' + estiloNav + '" onclick="Abastecimentos.navMesPeriodo(-1)"><span class="ms">chevron_left</span></button>' +
        '<select style="' + estiloSelect + '" onchange="Abastecimentos.setMesPeriodo(this.value)">' + htmlMes + '</select>' +
        '<select style="' + estiloSelect + ';flex:0 0 88px" onchange="Abastecimentos.setAnoPeriodo(this.value)">' + htmlAno + '</select>' +
        '<button style="' + estiloNav + '" onclick="Abastecimentos.navMesPeriodo(1)"><span class="ms">chevron_right</span></button>';
    } else if (f.modo === 'ano') {
      campos =
        '<button style="' + estiloNav + '" onclick="Abastecimentos.navAnoPeriodo(-1)"><span class="ms">chevron_left</span></button>' +
        '<select style="' + estiloSelect + '" onchange="Abastecimentos.setAnoPeriodo(this.value)">' + htmlAno + '</select>' +
        '<button style="' + estiloNav + '" onclick="Abastecimentos.navAnoPeriodo(1)"><span class="ms">chevron_right</span></button>';
    } else {
      campos = '<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;' +
        'color:var(--txt2,#93a4c8);font-size:13px;padding:10px;background:var(--bg2,#111c33);border-radius:9px;' +
        'border:1px solid var(--linha,#26365c)"><span class="ms" style="color:#60a5fa">all_inclusive</span>Todos os lanÃ§amentos</div>';
    }

    el.innerHTML = '<div style="background:var(--card,#16213b);border:1px solid var(--linha,#26365c);border-radius:16px;' +
      'padding:10px;margin-bottom:14px">' +
        '<div style="display:flex;gap:5px;background:var(--bg2,#111c33);border-radius:10px;padding:4px;margin-bottom:9px">' +
          '<button style="' + estiloAba(f.modo === 'mes') + '" onclick="Abastecimentos.setModoPeriodo(\'mes\')">MÃªs</button>' +
          '<button style="' + estiloAba(f.modo === 'ano') + '" onclick="Abastecimentos.setModoPeriodo(\'ano\')">Ano</button>' +
          '<button style="' + estiloAba(f.modo === 'tudo') + '" onclick="Abastecimentos.setModoPeriodo(\'tudo\')">Tudo</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:7px">' + campos + '</div>' +
      '</div>';
  },
  setModoPeriodo: function (m) { Abastecimentos.filtroPeriodo.modo = m; Abastecimentos.renderFiltroPeriodo(); Abastecimentos.renderKpis(); Abastecimentos.renderLista(); },
  setMesPeriodo: function (v) { Abastecimentos.filtroPeriodo.mes = parseInt(v, 10); Abastecimentos.renderFiltroPeriodo(); Abastecimentos.renderKpis(); Abastecimentos.renderLista(); },
  setAnoPeriodo: function (v) { Abastecimentos.filtroPeriodo.ano = parseInt(v, 10); Abastecimentos.renderFiltroPeriodo(); Abastecimentos.renderKpis(); Abastecimentos.renderLista(); },
  navMesPeriodo: function (d) {
    var f = Abastecimentos.filtroPeriodo;
    f.mes += d;
    if (f.mes > 12) { f.mes = 1; f.ano++; }
    if (f.mes < 1) { f.mes = 12; f.ano--; }
    Abastecimentos.renderFiltroPeriodo(); Abastecimentos.renderKpis(); Abastecimentos.renderLista();
  },
  navAnoPeriodo: function (d) { Abastecimentos.filtroPeriodo.ano += d; Abastecimentos.renderFiltroPeriodo(); Abastecimentos.renderKpis(); Abastecimentos.renderLista(); },

  setFiltro: function (f) {
    Abastecimentos.filtro = f;
    var abas = document.querySelectorAll('#pg-abastecimentos .aba-filtro');
    for (var i = 0; i < abas.length; i++) {
      abas[i].classList.toggle('sel', abas[i].dataset.filtro === f);
    }
    Abastecimentos.renderLista();
  },
  renderLista: function () {
    var el = document.getElementById('listaAbastecimentos');
    var lista = Abastecimentos._listaBase();
    if (Abastecimentos.filtro === 'viagem') {
      lista = lista.filter(function (a) { return !!a.viagemId; });
    } else if (Abastecimentos.filtro === 'rotina') {
      lista = lista.filter(function (a) { return !a.viagemId; });
    }
    if (lista.length === 0) {
      var semVeiculoFiltrado = !!App.veiculoAtivoId;
      el.innerHTML = '<div class="vazio-veiculo">' +
        '<span class="ms" style="color:#ef4444">local_gas_station</span>' +
        '<b>Nenhum abastecimento</b>' +
        '<p>' + (semVeiculoFiltrado
          ? 'Nenhum abastecimento deste veÃ­culo neste perÃ­odo. Selecione "Todos" ou troque o perÃ­odo acima.'
          : (Abastecimentos.filtro === 'todos'
              ? 'Nenhum lanÃ§amento neste perÃ­odo. Troque o filtro de perÃ­odo acima ou registre um novo.'
              : 'Nenhum registro nesse filtro.')) + '</p>' +
        '<button class="btn-novo" onclick="App.irParaFormAbastecimento()">' +
          '<span class="ms">add</span> Novo abastecimento' +
        '</button>' +
      '</div>';
      return;
    }
    el.innerHTML = lista.map(Abastecimentos.cardHTML).join('');
  },
  cardHTML: function (a) {
    var litros = Number(a.litros) || 0;
    var valor = Number(a.valorTotal) || (litros * (Number(a.precoLitro) || 0));
    var km = Number(a.km) || 0;
    var data = Abastecimentos.fmtData(a.data);
    var preco = Number(a.precoLitro) || 0;
    var unidade = Abastecimentos._unidadePorCombustivel(a.combustivel);
    unidade.sigla = a.unidade || unidade.sigla;
    var cheio = String(a.tanqueCheio).toUpperCase() === 'SIM';
    var nivelTxt = Abastecimentos._rotuloNivel(a.nivelTanque);
    var tags = [];
    tags.push('<span class="tag-abast ' + (cheio ? 'verde' : '') + '">' + nivelTxt + '</span>');
    if (a.viagemId) tags.push('<span class="tag-abast roxo">Viagem</span>');
    else tags.push('<span class="tag-abast azul">Dia a dia</span>');

    var veic = Abastecimentos.veiculosPorId[a.veiculoId];
    var chipVeiculo = '';
    if (veic) {
      var cor = App._corVeiculo ? App._corVeiculo(veic) : '#3b82f6';
      var icone = App._iconeTipoVeiculo ? App._iconeTipoVeiculo(veic.tipo) : 'directions_car';
      chipVeiculo = '<small style="display:flex;align-items:center;gap:4px;margin-top:2px;color:' + cor + ';font-weight:600">' +
        '<span class="ms" style="font-size:14px">' + icone + '</span>' +
        App.esc(veic.nome) + (veic.placa ? ' Â· ' + App.esc(veic.placa) : '') +
      '</small>';
    }

    return '<div class="card-abast">' +
      '<div class="cab-abast">' +
        '<div class="ico-abast"><span class="ms" style="color:#ef4444">local_gas_station</span></div>' +
        '<div class="info-abast">' +
          '<b>' + App.esc(Abastecimentos.fmtNum(litros, 2)) + ' ' + unidade.sigla + ' Â· ' + App.esc(App.moeda(valor)) + '</b>' +
          '<small>' + App.esc(data) + ' Â· ' + App.fmtNum(km) + ' km Â· ' + App.esc(a.combustivel || 'Gasolina') + '</small>' +
          (a.posto ? '<small>' + App.esc(a.posto) + ' Â· ' + App.esc(App.moeda(preco)) + '/' + unidade.sigla + '</small>' : '') +
          chipVeiculo +
          '<div class="tags-abast">' + tags.join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="acoes-abast">' +
        '<button onclick="App.irParaFormAbastecimento(\'' + a.id + '\')">' +
          '<span class="ms" style="color:#60a5fa">edit</span> Editar' +
        '</button>' +
        '<button class="excluir" onclick="Abastecimentos.excluir(\'' + a.id + '\')">' +
          '<span class="ms" style="color:#ef4444">delete</span> Excluir' +
        '</button>' +
      '</div>' +
    '</div>';
  },

  /* =========================================================
     UNIDADES POR COMBUSTIVEL (Litros / kWh / mÂ³)
     ========================================================= */
  _unidadePorCombustivel: function (combustivel) {
    var c = String(combustivel || '').toUpperCase();
    if (c.indexOf('ELÃ‰TR') > -1 || c.indexOf('ELETR') > -1) {
      return { sigla: 'kWh', labelQtd: 'Energia (kWh)', labelPreco: 'PreÃ§o / kWh', placeholder: '0,00', cor: '#22c55e', icone: 'ev_station' };
    }
    if (c.indexOf('GNV') > -1) {
      return { sigla: 'mÂ³', labelQtd: 'GÃ¡s (mÂ³)', labelPreco: 'PreÃ§o / mÂ³', placeholder: '0,00', cor: '#22d3ee', icone: 'propane_tank' };
    }
    if (c.indexOf('ETANOL') > -1) {
      return { sigla: 'L', labelQtd: 'Litros', labelPreco: 'PreÃ§o / litro', placeholder: '0,00', cor: '#22c55e', icone: 'local_gas_station' };
    }
    if (c.indexOf('DIESEL') > -1) {
      return { sigla: 'L', labelQtd: 'Litros', labelPreco: 'PreÃ§o / litro', placeholder: '0,00', cor: '#f59e0b', icone: 'local_gas_station' };
    }
    return { sigla: 'L', labelQtd: 'Litros', labelPreco: 'PreÃ§o / litro', placeholder: '0,00', cor: '#ef4444', icone: 'local_gas_station' };
  },

  _energeticosDoVeiculo: function (veiculo) {
    if (!veiculo) return ['Gasolina'];
    var txt = String(veiculo.energeticos || '').trim();
    if (txt) {
      var lista = txt.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (lista.length) return lista;
    }
    var c = String(veiculo.combustivel || '').toUpperCase();
    if (c.indexOf('ELÃ‰TR') > -1 || c.indexOf('ELETR') > -1) return ['ElÃ©trico'];
    if (c.indexOf('FLEX') > -1) return ['Gasolina', 'Etanol'];
    if (c.indexOf('GNV') > -1) return ['Gasolina', 'GNV'];
    if (c.indexOf('HÃBR') > -1 || c.indexOf('HIBR') > -1) return veiculo.plugIn ? ['Gasolina', 'ElÃ©trico'] : ['Gasolina'];
    if (c.indexOf('DIESEL') > -1) return ['Diesel'];
    if (c.indexOf('ETANOL') > -1) return ['Etanol'];
    return ['Gasolina'];
  },

  _veiculoFormAtual: function () {
    var el = document.getElementById('abVeiculo');
    var id = el ? el.value : null;
    return Abastecimentos.veiculos.filter(function (v) { return v.id === id; })[0] || null;
  },

  _energeticoFormAtual: function () {
    return Abastecimentos._form.energetico || 'Gasolina';
  },

  _selecionarEnergetico: function (energetico) {
    var veiculo = Abastecimentos._veiculoFormAtual();
    var permitidos = Abastecimentos._energeticosDoVeiculo(veiculo);
    if (permitidos.indexOf(energetico) === -1) energetico = permitidos[0] || 'Gasolina';
    Abastecimentos._form.energetico = energetico;
    Abastecimentos._renderCardsEnergeticos();
    Abastecimentos.atualizarUnidadesCombustivel();
  },

  _renderCardsEnergeticos: function () {
    var container = document.getElementById('abEnergeticos');
    if (!container) return;
    var veiculo = Abastecimentos._veiculoFormAtual();
    var lista = Abastecimentos._energeticosDoVeiculo(veiculo);
    var atual = Abastecimentos._form.energetico;
    if (lista.indexOf(atual) === -1) atual = lista[0] || 'Gasolina';
    Abastecimentos._form.energetico = atual;

    container.innerHTML = lista.map(function (e) {
      var u = Abastecimentos._unidadePorCombustivel(e);
      var sel = e === atual;
      return '<button type="button" onclick="Abastecimentos._selecionarEnergetico(\'' + e + '\')" ' +
        'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:84px;padding:11px 5px;border-radius:12px;font-family:inherit;cursor:pointer;text-align:center;transition:.15s;' +
        'background:' + (sel ? u.cor + '26' : 'var(--bg2,#111c33)') + ';border:2px solid ' + (sel ? u.cor : 'var(--linha,#26365c)') + ';color:' + (sel ? u.cor : 'var(--txt2,#93a4c8)') + '">' +
        '<span class="ms" style="font-size:26px;color:' + u.cor + '">' + u.icone + '</span>' +
        '<b style="font-size:11.5px">' + e + '</b><small style="font-size:9.5px;opacity:.75">' + u.sigla + '</small>' +
      '</button>';
    }).join('');
  },

  _rotuloNivel: function (nivel) {
    var n = Number(nivel);
    if (n === 100 || !nivel) return 'âœ“ Completo';
    if (n === 75) return '3/4 disponÃ­vel';
    if (n === 50) return 'Metade disponÃ­vel';
    if (n === 25) return '1/4 disponÃ­vel';
    return 'Parcial';
  },

  /* =========================================================
     BUSCA DE POSTOS  /* =========================================================
     BUSCA DE POSTOS / PONTOS DE RECARGA (gratuito, sem custo de API)
     ========================================================= */
  _OVERPASS_MIRRORS: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
  ],

  _haversineKm: function (lat1, lon1, lat2, lon2) {
    var R = 6371;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  _categoriaCombustivel: function (combustivel) {
    var c = String(combustivel || '').toUpperCase();
    if (c.indexOf('ELÃ‰TR') > -1 || c.indexOf('ELETR') > -1) return 'eletrico';
    if (c.indexOf('GNV') > -1) return 'gnv';
    return 'combustivel';
  },

  _obterLocalizacaoAtual: function () {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('GPS indisponÃ­vel')); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      }, function () {
        reject(new Error('NÃ£o foi possÃ­vel obter sua localizaÃ§Ã£o'));
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
        return {
          nome: addr.Title || 'Ponto de recarga',
          endereco: [addr.AddressLine1, addr.Town].filter(Boolean).join(', '),
          lat: addr.Latitude, lon: addr.Longitude,
          distanciaKm: typeof addr.Distance === 'number' ? Math.round(addr.Distance * 10) / 10 : null
        };
      }).sort(function (a, b) { return (a.distanciaKm == null ? 99 : a.distanciaKm) - (b.distanciaKm == null ? 99 : b.distanciaKm); });
    });
  },

  _buscarPostosOverpass: function (lat, lon) {
    var query = '[out:json][timeout:15];(node["amenity"="fuel"](around:5000,' + lat + ',' + lon + '););out center 15;';

    var tentar = function (idx) {
      if (idx >= Abastecimentos._OVERPASS_MIRRORS.length) {
        return Promise.reject(new Error('Servidores de mapas indisponÃ­veis no momento'));
      }
      var url = Abastecimentos._OVERPASS_MIRRORS[idx] + '?data=' + encodeURIComponent(query);
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
            distanciaKm: (elLat && elLon) ? Math.round(Abastecimentos._haversineKm(lat, lon, elLat, elLon) * 10) / 10 : null
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
    var veic = App.veiculoAtivoId ? Abastecimentos.veiculosPorId[App.veiculoAtivoId] : null;
    if (veic) {
      var energias = Abastecimentos._energeticosDoVeiculo(veic);
      if (energias.length === 1) {
        Abastecimentos._buscarPostosPara(Abastecimentos._categoriaCombustivel(energias[0]));
        return;
      }
    }
    var html = '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<button class="app-nav-item" onclick="App.fecharModal();Abastecimentos._buscarPostosPara(\'combustivel\')">' +
        '<span class="ms" style="color:#ef4444">local_gas_station</span><b>Postos de combustÃ­vel</b>' +
      '</button>' +
      '<button class="app-nav-item" onclick="App.fecharModal();Abastecimentos._buscarPostosPara(\'eletrico\')">' +
        '<span class="ms" style="color:#22c55e">ev_station</span><b>Pontos de recarga elÃ©trica</b>' +
      '</button>' +
      '<button class="app-nav-item" onclick="App.fecharModal();Abastecimentos._buscarPostosPara(\'gnv\')">' +
        '<span class="ms" style="color:#3b82f6">local_gas_station</span><b>Postos de GNV</b>' +
      '</button>' +
    '</div>';
    App.abrirModal('O que vocÃª procura?', html, null);
  },

  _buscarPostosPara: function (categoria) {
    App.abrirModal(categoria === 'eletrico' ? 'Pontos de recarga prÃ³ximos' : 'Postos prÃ³ximos',
      '<div style="text-align:center;padding:20px 0"><span class="ms" style="font-size:36px;opacity:.5">hourglass_top</span>' +
      '<p style="color:var(--txt2);margin-top:10px">Obtendo sua localizaÃ§Ã£o...</p></div>', null);

    Abastecimentos._obterLocalizacaoAtual().then(function (loc) {
      var busca = categoria === 'eletrico'
        ? Abastecimentos._buscarPontosRecargaOCM(loc.lat, loc.lon)
        : Abastecimentos._buscarPostosOverpass(loc.lat, loc.lon);

      busca.then(function (locais) {
        Abastecimentos._mostrarListaPostos(categoria, locais, loc);
      }).catch(function () {
        var termo = categoria === 'eletrico' ? 'carregador para carro elÃ©trico' : (categoria === 'gnv' ? 'posto de GNV' : 'posto de combustÃ­vel');
        window.open(Abastecimentos._linkBuscaMaps(termo, loc.lat, loc.lon), '_blank', 'noopener');
        App.fecharModal();
        App.toast('Busca detalhada indisponÃ­vel â€” abrindo Google Maps', 'ok');
      });
    }).catch(function () {
      var termo = categoria === 'eletrico' ? 'carregador para carro elÃ©trico' : (categoria === 'gnv' ? 'posto de GNV' : 'posto de combustÃ­vel');
      window.open(Abastecimentos._linkBuscaMaps(termo, null, null), '_blank', 'noopener');
      App.fecharModal();
      App.toast('LocalizaÃ§Ã£o nÃ£o disponÃ­vel â€” abrindo busca geral no Maps', 'ok');
    });
  },

  _mostrarListaPostos: function (categoria, locais, loc) {
    var termo = categoria === 'eletrico' ? 'carregador para carro elÃ©trico' : (categoria === 'gnv' ? 'posto de GNV' : 'posto de combustÃ­vel');
    var linkGenerico = Abastecimentos._linkBuscaMaps(termo, loc.lat, loc.lon);

    if (!locais || !locais.length) {
      App.abrirModal(categoria === 'eletrico' ? 'Pontos de recarga prÃ³ximos' : 'Postos prÃ³ximos',
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
          '</div>' +
          (p.distanciaKm != null ? '<b style="flex:none;color:' + cor + '">' + p.distanciaKm + ' km</b>' : '') +
        '</button>';
      }).join('') +
      '<button class="btn-novo-sec" style="width:100%" onclick="window.open(\'' + linkGenerico + '\',\'_blank\')">' +
        '<span class="ms" style="color:#60a5fa">map</span> Ver todos no Google Maps' +
      '</button>' +
    '</div>';

    App.abrirModal(categoria === 'eletrico' ? 'Pontos de recarga prÃ³ximos' : 'Postos prÃ³ximos', html, null);
  },

  usarLocalizacaoPosto: function () {
    var btn = document.getElementById('btnPinPosto');
    var input = document.getElementById('abPosto');
    if (!input) return;
    var combustivel = Abastecimentos._energeticoFormAtual();
    var categoria = Abastecimentos._categoriaCombustivel(combustivel);

    if (btn) { btn.disabled = true; var icoBtn = btn.querySelector('.ms'); if (icoBtn) icoBtn.textContent = 'hourglass_top'; }
    input.placeholder = 'Localizando...';

    Abastecimentos._obterLocalizacaoAtual().then(function (loc) {
      var busca = categoria === 'eletrico'
        ? Abastecimentos._buscarPontosRecargaOCM(loc.lat, loc.lon)
        : Abastecimentos._buscarPostosOverpass(loc.lat, loc.lon);
      return busca;
    }).then(function (locais) {
      if (btn) { btn.disabled = false; var icoBtn2 = btn.querySelector('.ms'); if (icoBtn2) icoBtn2.textContent = 'my_location'; }
      input.placeholder = categoria === 'eletrico' ? 'Ponto de recarga...' : 'Shell, Ipiranga...';
      if (locais && locais.length) {
        input.value = locais[0].nome;
        App.toast('Preenchido: ' + locais[0].nome, 'ok');
      } else {
        App.toast('Nenhum local encontrado por perto â€” preencha manualmente', 'erro');
      }
    }).catch(function (e) {
      if (btn) { btn.disabled = false; var icoBtn3 = btn.querySelector('.ms'); if (icoBtn3) icoBtn3.textContent = 'my_location'; }
      input.placeholder = categoria === 'eletrico' ? 'Ponto de recarga...' : 'Shell, Ipiranga...';
      App.toast(e.message || 'NÃ£o foi possÃ­vel localizar automaticamente', 'erro');
    });
  },

  /* =========================================================
     FORMULARIO
     ========================================================= */
  abrirForm: function (id, veiculoIdPre) {
    sb.from('veiculos').select('id, nome, placa, tipo, cor, combustivel, energeticos, plugIn, tanque, capacidadeGnv, capacidadeBateria', { count: 'exact' })
      .eq('organizacaoId', orgAtual.id)
      .order('nome')
      .then(function (r) {
        if (r.error || !r.data || r.data.length === 0) {
          App.abrirModal('VeÃ­culo necessÃ¡rio',
            '<div style="text-align:center;padding:10px 0">' +
              '<span class="ms" style="font-size:56px;color:var(--txt2);opacity:0.5">directions_car</span>' +
              '<h3 style="margin:16px 0 10px">Cadastre um veÃ­culo primeiro</h3>' +
              '<p style="color:var(--txt2);font-size:14px;line-height:1.6;margin:0 0 20px">' +
                'Para lanÃ§ar abastecimentos, vocÃª precisa cadastrar pelo menos um veÃ­culo.' +
              '</p>' +
            '</div>',
            function () { App.fecharModal(); App.irParaFormVeiculo(); },
            'Cadastrar veÃ­culo'
          );
          return;
        }
        Abastecimentos.veiculos = r.data;
        Abastecimentos._form.tipoLancamento = 'diaadia';
        Abastecimentos._form.nivelTanque = 100;
        Abastecimentos._form.viagensDoVeiculo = [];
        Abastecimentos._form.energetico = 'Gasolina';
        Abastecimentos._registrarListenerVeiculoGlobal(); /* garante que o form tambem escute, mesmo se aberto direto */

        if (id) {
          sb.from('abastecimentos').select('*').eq('id', id).single().then(function (r2) {
            if (r2.error || !r2.data) {
              App.toast('Abastecimento nÃ£o encontrado', 'erro');
              return;
            }
            Abastecimentos.editando = r2.data;
            Abastecimentos._form.tipoLancamento = r2.data.viagemId ? 'viagem' : 'diaadia';
            Abastecimentos._form.nivelTanque = Number(r2.data.nivelTanque) || 100;
            Abastecimentos.renderForm(veiculoIdPre);
          });
        } else {
          Abastecimentos.editando = null;
          Abastecimentos.renderForm(veiculoIdPre);
        }
      });
  },

  renderForm: function (veiculoIdPre) {
    var a = Abastecimentos.editando || {};
    var veiculos = Abastecimentos.veiculos || [];
    var vSel = a.veiculoId || veiculoIdPre || App.veiculoAtivoId || veiculos[0].id;
    var veicSel = veiculos.filter(function (v) { return v.id === vSel; })[0] || veiculos[0];
    var dataHoje = App.hojeISO();
    var veicOpts = veiculos.map(function (v) {
      return '<option value="' + v.id + '"' + (v.id === vSel ? ' selected' : '') + '>' + App.esc(v.nome) + (v.placa ? ' Â· ' + App.esc(v.placa) : '') + '</option>';
    }).join('');
    var permitidos = Abastecimentos._energeticosDoVeiculo(veicSel);
    var inicial = a.id && permitidos.indexOf(a.combustivel) > -1 ? a.combustivel : permitidos[0];
    Abastecimentos._form.energetico = inicial || 'Gasolina';
    var unidade = Abastecimentos._unidadePorCombustivel(Abastecimentos._form.energetico);

    var html =
      '<h2 class="form-titulo">' + (a.id ? 'Editar abastecimento' : 'Novo abastecimento') + '</h2>' +
      '<div class="campo-form"><label>VeÃ­culo</label><select id="abVeiculo" onchange="Abastecimentos.trocarVeiculoForm()">' + veicOpts + '</select></div>' +
      '<div class="campo-form"><label>EnergÃ©tico utilizado</label>' +
        '<div id="abEnergeticos" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px"></div>' +
        '<small>SÃ£o exibidos somente os energÃ©ticos aceitos pelo veÃ­culo selecionado.</small>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Data</label><input type="date" id="abData" value="' + (a.data || dataHoje) + '"></div>' +
        '<div class="campo-form"><label>KM do painel</label><input type="number" id="abKm" placeholder="0" value="' + (a.km || '') + '" oninput="Abastecimentos.previa()"></div>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label id="abLabelQtd">' + unidade.labelQtd + '</label><input type="number" id="abLitros" step="0.01" placeholder="' + unidade.placeholder + '" value="' + (a.litros || '') + '" oninput="Abastecimentos.calcTotal()"></div>' +
        '<div class="campo-form"><label id="abLabelPreco">' + unidade.labelPreco + '</label><input type="number" id="abPreco" step="0.001" placeholder="0,000" value="' + (a.precoLitro || '') + '" oninput="Abastecimentos.calcTotal()"></div>' +
      '</div>' +
      '<div class="campo-form"><label>Valor total</label><input type="number" id="abTotal" step="0.01" placeholder="0,00" value="' + (a.valorTotal || '') + '" oninput="Abastecimentos.calcInverso()"></div>' +
      '<div class="previa-abast" id="previaAbast" style="display:none"></div>' +
      '<div class="campo-form"><label>Posto / ponto de recarga <small style="text-transform:none;color:var(--txt2);font-weight:400">(opcional)</small></label>' +
        '<div style="display:flex;gap:8px"><input type="text" id="abPosto" placeholder="Posto ou ponto de recarga..." value="' + App.esc(a.posto || '') + '" style="flex:1;min-width:0">' +
        '<button type="button" id="btnPinPosto" class="btn-icone-campo" onclick="Abastecimentos.usarLocalizacaoPosto()" title="Usar minha localizaÃ§Ã£o"><span class="ms" style="color:#22d3ee">my_location</span></button></div>' +
        '<small style="display:block;margin-top:6px;color:var(--txt2);font-size:12px">Toque no alfinete para preencher automaticamente com o mais prÃ³ximo, ou digite manualmente.</small>' +
      '</div>' +
      '<div class="campo-form"><label>Este abastecimento Ã©...</label>' +
        '<div class="toggle-ida-volta" id="abTipoLancamentoBtns">' +
          '<button type="button" class="iv-btn' + (Abastecimentos._form.tipoLancamento === 'diaadia' ? ' sel' : '') + '" onclick="Abastecimentos.setTipoLancamento(\'diaadia\')"><span class="ms" style="color:#22c55e">home</span><b>Dia a dia</b><small>uso rotineiro</small></button>' +
          '<button type="button" class="iv-btn' + (Abastecimentos._form.tipoLancamento === 'viagem' ? ' sel' : '') + '" onclick="Abastecimentos.setTipoLancamento(\'viagem\')"><span class="ms" style="color:#a78bfa">luggage</span><b>Viagem especÃ­fica</b><small>vincular a uma viagem</small></button>' +
        '</div><div id="abViagemWrap" style="margin-top:10px;' + (Abastecimentos._form.tipoLancamento === 'viagem' ? '' : 'display:none') + '"></div>' +
      '</div>' +
      '<div class="campo-form"><label>NÃ­vel disponÃ­vel apÃ³s o lanÃ§amento</label>' +
        '<div style="background:var(--bg2,#111c33);border:1px solid var(--linha,#26365c);border-radius:14px;padding:14px">' +
          Abastecimentos._gaugeSVG(Abastecimentos._form.nivelTanque) +
          '<div id="abNivelBtns" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px">' + Abastecimentos._botoesNivel(Abastecimentos._form.nivelTanque) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>ObservaÃ§Ãµes</label><textarea id="abObs" rows="2" style="width:100%;background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;color:var(--txt);font-family:inherit;font-size:14px;resize:vertical">' + App.esc(a.obs || '') + '</textarea></div>' +
      '<div class="form-acoes"><button class="btn-cancelar-form" onclick="App.irPara(\'abastecimentos\')">Cancelar</button>' +
        '<button class="btn-salvar-form" id="btnSalvarAb" onclick="Abastecimentos.validarESalvar()">' + (a.id ? 'Salvar alteraÃ§Ãµes' : 'Registrar abastecimento') + '</button></div>';

    document.getElementById('formAbastecimentoContainer').innerHTML = html;
    Abastecimentos._renderCardsEnergeticos();
    Abastecimentos.atualizarUnidadesCombustivel();
    Abastecimentos.previa();
    if (Abastecimentos._form.tipoLancamento === 'viagem') Abastecimentos._carregarViagensDoVeiculo(vSel, a.viagemId);
  },

  trocarVeiculoForm: function () {
    var veiculo = Abastecimentos._veiculoFormAtual();
    var lista = Abastecimentos._energeticosDoVeiculo(veiculo);
    Abastecimentos._form.energetico = lista[0] || 'Gasolina';
    Abastecimentos._renderCardsEnergeticos();
    Abastecimentos.atualizarUnidadesCombustivel();
    if (Abastecimentos._form.tipoLancamento === 'viagem') {
      var sel = document.getElementById('abVeiculo');
      Abastecimentos._carregarViagensDoVeiculo(sel ? sel.value : null, null);
    }
  },

  atualizarUnidadesCombustivel: function () {
    var unidade = Abastecimentos._unidadePorCombustivel(Abastecimentos._energeticoFormAtual());
    var labelQtd = document.getElementById('abLabelQtd');
    var labelPreco = document.getElementById('abLabelPreco');
    var inputQtd = document.getElementById('abLitros');
    if (labelQtd) labelQtd.textContent = unidade.labelQtd;
    if (labelPreco) labelPreco.textContent = unidade.labelPreco;
    if (inputQtd) inputQtd.placeholder = unidade.placeholder;
    Abastecimentos.previa();
  },

  /* =========================================================
     TIPO DE LANÃ‡AMENTO  /* =========================================================
     TIPO DE LANÃ‡AMENTO: DIA A DIA vs VIAGEM ESPECÃFICA
     ========================================================= */
  setTipoLancamento: function (tipo) {
    Abastecimentos._form.tipoLancamento = tipo;
    var btns = document.querySelectorAll('#abTipoLancamentoBtns .iv-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('sel');
    (tipo === 'diaadia' ? btns[0] : btns[1]).classList.add('sel');

    var wrap = document.getElementById('abViagemWrap');
    if (!wrap) return;
    if (tipo === 'viagem') {
      wrap.style.display = '';
      var veicId = document.getElementById('abVeiculo') ? document.getElementById('abVeiculo').value : null;
      var viagemAtual = Abastecimentos.editando ? Abastecimentos.editando.viagemId : null;
      Abastecimentos._carregarViagensDoVeiculo(veicId, viagemAtual);
    } else {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
    }
  },

  _carregarViagensDoVeiculo: function (veiculoId, viagemSelecionadaId) {
    var wrap = document.getElementById('abViagemWrap');
    if (!wrap || !veiculoId) return;
    wrap.innerHTML = '<div style="font-size:12.5px;color:var(--txt2)"><span class="ms" style="font-size:14px;vertical-align:middle;color:#60a5fa">hourglass_top</span> Carregando viagens...</div>';

    sb.from('viagens').select('id, titulo, origem, destino, status')
      .eq('organizacaoId', orgAtual.id)
      .eq('veiculoId', veiculoId)
      .in('status', ['planejada', 'andamento'])
      .order('dataInicio', { ascending: false })
      .then(function (r) {
        var viagens = r.data || [];
        Abastecimentos._form.viagensDoVeiculo = viagens;

        if (viagemSelecionadaId && !viagens.some(function (v) { return v.id === viagemSelecionadaId; })) {
          sb.from('viagens').select('id, titulo, origem, destino, status').eq('id', viagemSelecionadaId).single().then(function (r2) {
            if (r2.data) viagens = viagens.concat([r2.data]);
            Abastecimentos._renderSelectViagens(viagens, viagemSelecionadaId);
          });
        } else {
          Abastecimentos._renderSelectViagens(viagens, viagemSelecionadaId);
        }
      });
  },

  _renderSelectViagens: function (viagens, viagemSelecionadaId) {
    var wrap = document.getElementById('abViagemWrap');
    if (!wrap) return;
    if (!viagens.length) {
      wrap.innerHTML = '<div style="font-size:12.5px;color:var(--txt2);padding:10px;background:var(--card,#16213b);border-radius:9px;border:1px solid var(--linha,#26365c)">' +
        '<span class="ms" style="font-size:14px;vertical-align:middle;color:#60a5fa">info</span> ' +
        'Nenhuma viagem planejada ou em andamento para este veÃ­culo. Crie uma viagem primeiro.' +
      '</div>';
      return;
    }
    var opts = viagens.map(function (v) {
      var titulo = v.titulo || (v.origem + ' â†’ ' + v.destino);
      return '<option value="' + v.id + '"' + (v.id === viagemSelecionadaId ? ' selected' : '') + '>' + App.esc(titulo) + '</option>';
    }).join('');
    wrap.innerHTML = '<select id="abViagem">' + opts + '</select>';
  },

  /* =========================================================
     NÃVEL DO TANQUE â€” medidor visual (ponteiro) + botÃµes coloridos
     ========================================================= */
  _gaugeSVG: function (valorAtual) {
    var v = Number(valorAtual) || 100;
    var angulo = -90 + (v / 100 * 180);
    return '<svg viewBox="0 0 200 110" style="width:100%;max-width:260px;display:block;margin:0 auto">' +
      '<defs>' +
        '<linearGradient id="gaugeGradAbast" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0%" stop-color="#f59e0b"/>' +
          '<stop offset="35%" stop-color="#eab308"/>' +
          '<stop offset="65%" stop-color="#84cc16"/>' +
          '<stop offset="100%" stop-color="#22c55e"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke="url(#gaugeGradAbast)" stroke-width="14" stroke-linecap="round"/>' +
      '<text x="14" y="108" fill="#93a4c8" font-size="11" font-family="inherit">E</text>' +
      '<text x="186" y="108" fill="#93a4c8" font-size="11" font-family="inherit" text-anchor="end">F</text>' +
      '<circle cx="100" cy="100" r="7" fill="#e8eefc"/>' +
      '<line id="agulhaTanqueAbast" x1="100" y1="100" x2="100" y2="28" stroke="#e8eefc" stroke-width="4" stroke-linecap="round" ' +
        'style="transform-origin:100px 100px;transform:rotate(' + angulo + 'deg);transition:transform .35s ease"></line>' +
    '</svg>';
  },

  _botoesNivel: function (nivelAtual) {
    var opcoes = [
      { valor: 25, label: '1/4', cor: '#f59e0b' },
      { valor: 50, label: 'Metade', cor: '#eab308' },
      { valor: 75, label: '3/4', cor: '#84cc16' },
      { valor: 100, label: 'Cheio', cor: '#22c55e' }
    ];
    return opcoes.map(function (o) {
      var sel = Number(nivelAtual) === o.valor;
      var estilo = sel
        ? 'background:' + o.cor + '26;border:2px solid ' + o.cor + ';color:' + o.cor + ';font-weight:700'
        : 'background:var(--card,#16213b);border:2px solid var(--linha,#26365c);color:var(--txt2,#93a4c8);font-weight:600';
      return '<button type="button" onclick="Abastecimentos.setNivel(' + o.valor + ')" ' +
        'style="' + estilo + ';border-radius:12px;padding:12px 4px;font-size:12.5px;cursor:pointer;font-family:inherit;text-align:center;transition:.15s">' +
        o.label +
      '</button>';
    }).join('');
  },

  setNivel: function (valor) {
    Abastecimentos._form.nivelTanque = valor;
    var agulha = document.getElementById('agulhaTanqueAbast');
    if (agulha) {
      var angulo = -90 + (valor / 100 * 180);
      agulha.style.transform = 'rotate(' + angulo + 'deg)';
    }
    var el = document.getElementById('abNivelBtns');
    if (el) el.innerHTML = Abastecimentos._botoesNivel(valor);
  },

  /* =========================================================
     CALCULOS DO FORMULARIO
     ========================================================= */
  calcTotal: function () {
    var l = Number(document.getElementById('abLitros').value) || 0;
    var p = Number(document.getElementById('abPreco').value) || 0;
    if (l > 0 && p > 0) {
      document.getElementById('abTotal').value = (l * p).toFixed(2);
    }
    Abastecimentos.previa();
  },
  calcInverso: function () {
    var t = Number(document.getElementById('abTotal').value) || 0;
    var l = Number(document.getElementById('abLitros').value) || 0;
    if (t > 0 && l > 0) {
      document.getElementById('abPreco').value = (t / l).toFixed(3);
    }
    Abastecimentos.previa();
  },
  previa: function () {
    var el = document.getElementById('previaAbast');
    if (!el) return;
    var unidade = Abastecimentos._unidadePorCombustivel(Abastecimentos._energeticoFormAtual());
    var l = Number(document.getElementById('abLitros').value) || 0;
    var t = Number(document.getElementById('abTotal').value) || 0;
    var p = Number(document.getElementById('abPreco').value) || 0;
    if (l <= 0 && t <= 0) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = 'block';
    var html = '<div><b>' + Abastecimentos.fmtNum(l, 2) + ' ' + unidade.sigla + '</b>';
    if (p > 0) html += ' Â· R$ ' + Abastecimentos.fmtNum(p, 3) + '/' + unidade.sigla;
    if (t > 0) html += ' = <b>' + App.moeda(t) + '</b>';
    html += '</div>';
    el.innerHTML = html;
  },

/* =========================================================
   SALVAR (com alerta especial para KM ausente)
   ========================================================= */
validarESalvar: function () {

  var l = Number(document.getElementById('abLitros').value) || 0;

  if (l <= 0) {
    App.toast('Informe a quantidade abastecida', 'erro');
    return;
  }

  var km = Number(document.getElementById('abKm').value) || 0;

  if (km <= 0) {

    App.confirmar({
      titulo: 'Salvar sem o KM do painel?',
      mensagem:
        'VocÃª nÃ£o informou o <b>KM do painel</b>. ' +
        'Esse dado Ã© importante para calcular corretamente as prÃ³ximas revisÃµes ' +
        'de manutenÃ§Ã£o baseadas em quilometragem. VocÃª pode voltar e preencher, ' +
        'ou salvar mesmo assim.',
      textoBotao: 'Salvar mesmo assim',
      tipo: 'aviso',
      icone: 'speed',

      aoConfirmar: function () {
        Abastecimentos._executarSalvar();
      }
    });

    return;
  }

  Abastecimentos._executarSalvar();
},

/* =========================================================
   EXECUTAR SALVAMENTO
   ========================================================= */
_executarSalvar: async function () {

  var nivelTanque = Abastecimentos._form.nivelTanque || 100;
  var tipoLancamento = Abastecimentos._form.tipoLancamento || 'diaadia';
  var viagemSel = document.getElementById('abViagem');
  var viagemId = (
    tipoLancamento === 'viagem' &&
    viagemSel &&
    viagemSel.value
  ) ? viagemSel.value : null;

  var veiculoId = document.getElementById('abVeiculo').value;
  var kmInformado = Number(document.getElementById('abKm').value) || 0;
  var idEmEdicao = (
    Abastecimentos.editando &&
    Abastecimentos.editando.id
  ) ? Abastecimentos.editando.id : null;

  var btn = document.getElementById('btnSalvarAb');
  var textoNormal = idEmEdicao
    ? 'Salvar alterações'
    : 'Registrar abastecimento';

  if (!veiculoId) {
    App.toast('Selecione o veículo.', 'erro');
    return;
  }

  btn.disabled = true;
  btn.textContent = navigator.onLine ? 'Salvando...' : 'Salvando no aparelho...';

  try {

    /* =====================================================
       VALIDAÇÃO DE KM REGRESSIVO
       Considera registros confirmados e pendências locais.
       ===================================================== */
    var ultimoKm = await Abastecimentos.buscarUltimoKmVeiculo(
      veiculoId,
      idEmEdicao
    );

    if (
      ultimoKm !== null &&
      kmInformado > 0 &&
      kmInformado <= ultimoKm
    ) {
      App.toast(
        'KM informado (' +
        App.fmtNum(kmInformado) +
        ') deve ser maior que o último abastecimento registrado (' +
        App.fmtNum(ultimoKm) +
        ' km).',
        'erro'
      );
      return;
    }

    /* =====================================================
       REGISTRO
       ===================================================== */
    var energetico = Abastecimentos._energeticoFormAtual();

    var reg = {
      organizacaoId: orgAtual.id,
      usuarioId: usuarioAtual.id,
      veiculoId: veiculoId,
      data: document.getElementById('abData').value,
      km: kmInformado,
      litros: Number(document.getElementById('abLitros').value) || 0,
      precoLitro: Number(document.getElementById('abPreco').value) || 0,
      valorTotal: Number(document.getElementById('abTotal').value) || 0,
      posto: document.getElementById('abPosto').value.trim(),
      combustivel: energetico,
      unidade: Abastecimentos._unidadePorCombustivel(energetico).sigla,
      tanqueCheio: nivelTanque === 100 ? 'SIM' : 'NAO',
      nivelTanque: nivelTanque,
      viagemId: viagemId,
      obs: document.getElementById('abObs').value.trim()
    };

    var operacao;
    var filtros = {};

    if (idEmEdicao) {
      operacao = 'update';
      filtros.id = idEmEdicao;
    } else {
      operacao = 'insert';
      reg.id = 'ABS_' + App.uid();
    }

    var resultado;

    /* =====================================================
       SALVAMENTO ONLINE/OFFLINE
       ===================================================== */
    if (
      typeof Offline !== 'undefined' &&
      Offline &&
      typeof Offline.salvar === 'function'
    ) {
      resultado = await Offline.salvar({
        tabela: 'abastecimentos',
        operacao: operacao,
        registro: reg,
        registroId: idEmEdicao || reg.id,
        filtros: filtros,
        metadados: {
          modulo: 'abastecimentos',
          veiculoId: veiculoId,
          viagemId: viagemId,
          energetico: energetico,
          unidade: reg.unidade
        }
      });
    } else {
      /* Compatibilidade de segurança enquanto offline.js não estiver ativo. */
      var respostaDireta;

      if (operacao === 'update') {
        respostaDireta = await sb
          .from('abastecimentos')
          .update(reg)
          .eq('id', idEmEdicao);
      } else {
        respostaDireta = await sb
          .from('abastecimentos')
          .insert(reg);
      }

      resultado = {
        offline: false,
        pendente: false,
        data: respostaDireta.data || null,
        error: respostaDireta.error || null
      };
    }

    if (resultado.error) {
      App.toast(
        'Erro: ' + (resultado.error.message || resultado.error),
        'erro'
      );
      return;
    }

    if (resultado.pendente) {
      /* Mantém o lançamento visível na sessão atual. */
      var localReg = Object.assign({}, reg, {
        id: idEmEdicao || reg.id,
        _offlinePendente: true,
        _offlineFilaId: resultado.filaId
      });

      if (idEmEdicao) {
        Abastecimentos.lista = (Abastecimentos.lista || []).map(function (item) {
          return item.id === idEmEdicao
            ? Object.assign({}, item, localReg)
            : item;
        });
      } else {
        Abastecimentos.lista = [localReg].concat(Abastecimentos.lista || []);
      }

      App.toast(
        idEmEdicao
          ? 'Alteração salva no aparelho e aguardando sincronização.'
          : 'Abastecimento salvo no aparelho e aguardando sincronização.',
        'ok'
      );
    } else {
      App.toast(
        idEmEdicao
          ? 'Atualizado!'
          : 'Abastecimento registrado!',
        'ok'
      );
    }

    Abastecimentos.editando = null;
    App.irPara('abastecimentos');

  } catch (e) {
    console.error('Erro ao salvar abastecimento:', e);

    App.toast(
      navigator.onLine
        ? 'Erro ao salvar abastecimento.'
        : 'Não foi possível guardar o abastecimento neste aparelho.',
      'erro'
    );
  } finally {
    btn.disabled = false;
    btn.textContent = textoNormal;
  }
},

/* =========================================================
   BUSCAR ÚLTIMO KM DO VEÍCULO
   Considera Supabase e fila offline ainda não sincronizada.
   ========================================================= */
buscarUltimoKmVeiculo: async function (veiculoId, ignorarId) {

  var kms = [];

  /* Pendências locais precisam participar da validação. */
  if (
    typeof Offline !== 'undefined' &&
    Offline &&
    typeof Offline.listarPendentes === 'function'
  ) {
    try {
      var pendentes = await Offline.listarPendentes();

      pendentes.forEach(function (item) {
        if (
          item.tabela === 'abastecimentos' &&
          item.operacao !== 'delete' &&
          item.registro &&
          item.registro.veiculoId === veiculoId &&
          item.registroId !== ignorarId &&
          item.registro.id !== ignorarId
        ) {
          var kmLocal = Number(item.registro.km) || 0;
          if (kmLocal > 0) kms.push(kmLocal);
        }
      });
    } catch (erroLocal) {
      console.warn('Não foi possível consultar o KM da fila offline:', erroLocal);
    }
  }

  /* Sem rede, usa somente os dados locais disponíveis. */
  if (!navigator.onLine) {
    return kms.length ? Math.max.apply(null, kms) : null;
  }

  try {
    var consulta = sb
      .from('abastecimentos')
      .select('id, km')
      .eq('veiculoId', veiculoId)
      .order('km', { ascending: false })
      .limit(1);

    if (ignorarId) {
      consulta = consulta.neq('id', ignorarId);
    }

    var r = await consulta;

    if (r.error) {
      if (
        typeof Offline !== 'undefined' &&
        Offline._ehErroDeRede &&
        Offline._ehErroDeRede(r.error)
      ) {
        return kms.length ? Math.max.apply(null, kms) : null;
      }
      throw r.error;
    }

    if (r.data && r.data.length) {
      var kmServidor = Number(r.data[0].km) || 0;
      if (kmServidor > 0) kms.push(kmServidor);
    }
  } catch (erroServidor) {
    if (
      typeof Offline !== 'undefined' &&
      Offline._ehErroDeRede &&
      Offline._ehErroDeRede(erroServidor)
    ) {
      return kms.length ? Math.max.apply(null, kms) : null;
    }
    throw erroServidor;
  }

  return kms.length ? Math.max.apply(null, kms) : null;
},

  excluir: function (id) {
    var ab = Abastecimentos.lista.filter(function (a) { return a.id === id; })[0] || {};
    var litros = Abastecimentos.fmtNum(ab.litros, 2);
    var valor = App.moeda(ab.valorTotal);
    App.confirmar({
      titulo: 'Excluir abastecimento',
      mensagem: 'O abastecimento de <b>' + litros + '</b> por <b>' + valor + '</b> ' +
        'serÃ¡ excluÃ­do permanentemente.',
      textoBotao: 'Excluir abastecimento',
      tipo: 'perigo',
      icone: 'local_gas_station',
      aoConfirmar: function () {
        sb.from('abastecimentos').delete().eq('id', id).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Abastecimento excluÃ­do', 'ok');
          Abastecimentos.carregarLista();
        });
      }
    });
  },

  /* =========================================================
     UTILITARIOS
     ========================================================= */
  fmtData: function (s) {
    if (!s) return 'â€”';
    var p = String(s).substring(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s;
  },
  fmtNum: function (n, casas) {
    n = Number(n) || 0;
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: casas || 0,
      maximumFractionDigits: casas || 0
    });
  }
};

