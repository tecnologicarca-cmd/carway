/* APP_VERSION: v2.5 - energeticos inteligentes */
/* =====================================================================
   CARWAY - VEICULOS
   v2.3 (esta versao)
   - NOVO: o rotulo do campo "Tanque" agora muda dinamicamente conforme
     o combustivel selecionado: Eletrico -> "Capacidade da bateria
     (kWh)"; GNV -> "Cilindro de GNV (mÂ³)"; Hibrido -> "Tanque (litros)
     + bateria"; demais -> "Tanque (litros)" (padrao). O campo no banco
     continua sendo o mesmo (v.tanque) â€” muda so o rotulo/placeholder,
     para o usuario nao digitar litros achando que e kWh (ou vice-versa).
     Funciona tanto ao trocar o combustivel manualmente quanto quando a
     FIPE preenche o combustivel sozinha, e tambem ja aparece correto
     ao abrir a tela de EDITAR um veiculo que ja seja eletrico/GNV.
   v2.2
   - CORRIGIDO: o card mostrava "KM ATUAL" mas na verdade exibia
     v.kmInicial (o km digitado uma UNICA vez no cadastro, nunca
     atualizado depois). Agora mostra o KM DO ULTIMO ABASTECIMENTO
     (com a data), que e o dado real mais recente disponivel â€” muito
     mais util para saber o km "atual" de verdade. Se o veiculo ainda
     nao tem nenhum abastecimento, cai de volta para o km do cadastro,
     com o rotulo deixando isso claro ("KM cadastro").
   - CORRIGIDO: ao consultar a FIPE DENTRO do formulario de cadastro,
     o valor consultado nunca era salvo (fipeValor ficava de fora do
     objeto enviado ao Supabase) â€” por isso o chip de FIPE ao lado de
     "viagens" nunca aparecia logo apos cadastrar. Agora, se a FIPE for
     consultada durante o cadastro/edicao, o valor e salvo junto com o
     resto do formulario automaticamente.
   v2.1
   - CORRIGIDO: ao trocar o TIPO do veiculo no formulario, a consulta
     FIPE ficava "presa" nas marcas do tipo anterior ate dar refresh.
     Agora, trocar o tipo reseta o cache e recarrega as marcas na hora
     se o painel da FIPE ja estiver aberto.
   - NOVO: botoes "Plano", "FIPE" e "Custo" (antes "Em breve") agora
     sao funcionais:
       Plano  -> abre Manutencao filtrado neste veiculo, aba Planos
       RevisÃµes -> abre Manutencao filtrado neste veiculo, aba Monitoramento
       FIPE   -> modal para consultar e salvar o valor de mercado atual
       Custo  -> modal com o total gasto (combustivel/despesas/manutencao)
                 somente deste veiculo, desde sempre
   - Icones recoloridos seguindo o padrao do app: bomba de combustivel
     sempre vermelha; manutencao amarelo; plano/revisao roxo; editar
     azul; FIPE ciano; custo verde; excluir vermelho.
   v2.0
   - NOVO: conectado ao seletor de veiculo GLOBAL/UNIVERSAL (App.veiculoAtivoId).
     Quando um veiculo especifico esta selecionado na barra do topo, esta
     pagina mostra somente o card daquele veiculo. Selecionando "Todos",
     volta a mostrar a lista completa (comportamento de sempre).
   - NOVO: se inscreve em App.aoTrocarVeiculoAtivo, entao se o usuario
     trocar o veiculo em QUALQUER outra pagina e depois visitar "Meus
     veiculos", a tela ja aparece filtrada corretamente sem precisar
     recarregar.
   - NOVO: apos criar, editar ou excluir um veiculo, chama
     App.atualizarBarraVeiculoGlobal() para o chip da barra global
     (nome, cor, icone) refletir a mudanca imediatamente.
   - Se o veiculo que estava filtrado for excluido, o filtro volta
     automaticamente para "Todos" (evita tela vazia/quebrada).
   ===================================================================== */
var TIPOS_VEICULO = [
  { id: 'carro',    nome: 'Carro',    icone: 'directions_car' },
  { id: 'moto',     nome: 'Moto',     icone: 'two_wheeler' },
  { id: 'suv',      nome: 'SUV',      icone: 'directions_car' },
  { id: 'van',      nome: 'Van',      icone: 'airport_shuttle' },
  { id: 'caminhao', nome: 'CaminhÃ£o', icone: 'local_shipping' },
  { id: 'onibus',   nome: 'Ã”nibus',   icone: 'directions_bus' }
];
var CORES_VEICULO = [
  { id: 'azul',     hex: '#3b82f6' },
  { id: 'verde',    hex: '#22c55e' },
  { id: 'roxo',     hex: '#a78bfa' },
  { id: 'laranja',  hex: '#f59e0b' },
  { id: 'vermelho', hex: '#ef4444' },
  { id: 'ciano',    hex: '#22d3ee' },
  { id: 'rosa',     hex: '#ec4899' },
  { id: 'cinza',    hex: '#94a3b8' }
];
/* =====================================================================
   ENERGETICOS DO VEICULO
   "combustivel" preserva a classificacao visivel (Flex, Hibrido etc.).
   "energeticos" informa o que realmente pode ser abastecido/recarregado.
   ===================================================================== */
var ENERGETICOS_VEICULO = [
  { id: 'Gasolina', unidade: 'L',   icone: 'local_gas_station', cor: '#ef4444' },
  { id: 'Etanol',   unidade: 'L',   icone: 'local_gas_station', cor: '#22c55e' },
  { id: 'Diesel',   unidade: 'L',   icone: 'local_gas_station', cor: '#f59e0b' },
  { id: 'GNV',      unidade: 'mÂ³',  icone: 'propane_tank',      cor: '#22d3ee' },
  { id: 'ElÃ©trico', unidade: 'kWh', icone: 'ev_station',        cor: '#22c55e' }
];

var EnergeticosVeiculo = {
  porId: function (id) {
    for (var i = 0; i < ENERGETICOS_VEICULO.length; i++) {
      if (ENERGETICOS_VEICULO[i].id === id) return ENERGETICOS_VEICULO[i];
    }
    return ENERGETICOS_VEICULO[0];
  },

  /* EnergÃ©ticos originais de fÃ¡brica conforme a classificaÃ§Ã£o escolhida. */
  baseDoTipo: function (tipo, plugIn) {
    var c = String(tipo || '').toUpperCase();
    if (c.indexOf('ELÃ‰TR') > -1 || c.indexOf('ELETR') > -1) return ['ElÃ©trico'];
    if (c.indexOf('FLEX') > -1) return ['Gasolina', 'Etanol'];
    if (c.indexOf('GNV') > -1) return ['Gasolina', 'GNV'];
    if (c.indexOf('HÃBR') > -1 || c.indexOf('HIBR') > -1) return plugIn ? ['Gasolina', 'ElÃ©trico'] : ['Gasolina'];
    if (c.indexOf('DIESEL') > -1) return ['Diesel'];
    if (c.indexOf('ETANOL') > -1) return ['Etanol'];
    return ['Gasolina'];
  },

  /* Ãšnicas adaptaÃ§Ãµes permitidas no formulÃ¡rio.
     Gasolina, Etanol e Flex podem receber kit GNV.
     Diesel, ElÃ©trico, GNV e HÃ­brido nÃ£o exibem adaptaÃ§Ãµes incompatÃ­veis. */
  adaptaveisDoTipo: function (tipo) {
    var c = String(tipo || '').toUpperCase();
    if (c === 'GASOLINA' || c === 'ETANOL' || c === 'FLEX') return ['GNV'];
    return [];
  },

  permitidosDoTipo: function (tipo, plugIn) {
    return EnergeticosVeiculo.baseDoTipo(tipo, plugIn).concat(EnergeticosVeiculo.adaptaveisDoTipo(tipo));
  },

  normalizar: function (tipo, plugIn, listaAnterior) {
    var base = EnergeticosVeiculo.baseDoTipo(tipo, plugIn);
    var opcionais = EnergeticosVeiculo.adaptaveisDoTipo(tipo);
    var resultado = base.slice();
    (listaAnterior || []).forEach(function (e) {
      if (opcionais.indexOf(e) > -1 && resultado.indexOf(e) === -1) resultado.push(e);
    });
    return resultado;
  },

  doVeiculo: function (v) {
    if (!v) return ['Gasolina'];
    var txt = String(v.energeticos || '').trim();
    var lista = txt ? txt.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
    return EnergeticosVeiculo.normalizar(v.combustivel, !!v.plugIn, lista);
  },

  unidade: function (id) {
    return EnergeticosVeiculo.porId(id).unidade;
  }
};

var Veiculos = {
  lista: [],
  editando: null,
  fipe: { tipo: '', marcas: [], modelos: [], anos: [] },

  /* Guarda o valor FIPE numerico consultado DURANTE a sessao atual do
     formulario (cadastro ou edicao), para ser salvo junto no submit.
     E resetado sempre que o form e aberto do zero ou o tipo do veiculo
     muda (a consulta anterior deixa de fazer sentido). */
  _fipeConsultaFormValor: null,

  /* Flag para registrar o listener global apenas uma vez */
  _listenerVeiculoRegistrado: false,

  /* Registra (uma unica vez) um ouvinte na barra de veiculo GLOBAL
     (App.aoTrocarVeiculoAtivo, definida em app.js). Sempre que o
     usuario trocar o veiculo ativo em QUALQUER pagina do app, esta
     pagina e avisada e, se estiver aberta na hora, se redesenha sozinha. */
  _registrarListenerVeiculoGlobal: function () {
    if (Veiculos._listenerVeiculoRegistrado) return;
    if (typeof App === 'undefined' || !App.aoTrocarVeiculoAtivo) return;
    Veiculos._listenerVeiculoRegistrado = true;
    App.aoTrocarVeiculoAtivo(function () {
      var pg = document.getElementById('pg-veiculos');
      if (pg && pg.classList.contains('ativa')) {
        Veiculos._renderLista();
      }
    });
  },

  carregarLista: function () {
    var lista = document.getElementById('listaVeiculos');
    var aviso = document.getElementById('avisoPlanoVeiculos');
    var btnNovo = document.getElementById('btnNovoVeiculo');
    lista.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';
    aviso.innerHTML = '';

    Veiculos._registrarListenerVeiculoGlobal();

    Promise.all([
      sb.from('veiculos').select('*').eq('organizacaoId', orgAtual.id).order('criadoEm', { ascending: false }),
      sb.from('abastecimentos').select('veiculoId, km, litros, tanqueCheio, data').eq('organizacaoId', orgAtual.id),
      sb.from('manutencoes').select('veiculoId').eq('organizacaoId', orgAtual.id),
      sb.from('viagens').select('veiculoId').eq('organizacaoId', orgAtual.id)
    ]).then(function (r) {
      if (r[0].error) {
        lista.innerHTML = '<div class="vazio-veiculo"><p>Erro ao carregar.</p></div>';
        return;
      }
      Veiculos.lista = r[0].data || [];
      var abastecimentos = r[1].data || [];
      var manutencoes = r[2].data || [];
      var viagens = r[3].data || [];

      /* Se o veiculo filtrado na barra global foi excluido nesse meio
         tempo, volta para "Todos" para nao deixar a tela vazia/quebrada. */
      if (App.veiculoAtivoId && !Veiculos.lista.some(function (v) { return v.id === App.veiculoAtivoId; })) {
        App.veiculoAtivoId = null;
        App._salvarVeiculoAtivo();
        App._renderConteudoBarraVeiculoGlobal();
      }

      /* PrÃ©-calcula, por veÃ­culo, contadores reais, consumo (km/L,
         km/Tanque) e o ULTIMO ABASTECIMENTO (km + data) â€” este ultimo
         e usado no card como o "km atual" real, no lugar do km do
         cadastro (que nunca muda depois de criado). */
      Veiculos._stats = {};
      Veiculos.lista.forEach(function (v) {
        var absDoVeic = abastecimentos.filter(function (a) { return a.veiculoId === v.id; });
        var qtdManut = manutencoes.filter(function (m) { return m.veiculoId === v.id; }).length;
        var qtdViagens = viagens.filter(function (vi) { return vi.veiculoId === v.id; }).length;
        var consumo = App.calcularConsumo(absDoVeic, v.tanque);
        Veiculos._stats[v.id] = {
          qtdAbastecimentos: absDoVeic.length,
          qtdManutencoes: qtdManut,
          qtdViagens: qtdViagens,
          kmL: consumo.kmL,
          kmTanque: consumo.kmTanque,
          temConsumo: consumo.temDados,
          ultimoAbastecimento: Veiculos._ultimoAbastecimento(absDoVeic)
        };
      });

      var maxV = orgAtual.maxVeiculos || 1;
      if (Veiculos.lista.length >= maxV) {
        btnNovo.disabled = true;
        aviso.innerHTML = '<div class="aviso-plano"><b>Limite do plano ' + App.nomePlano(orgAtual.tipoPlano) + '</b>' +
          'VocÃª jÃ¡ tem ' + Veiculos.lista.length + ' de ' + maxV + ' veÃ­culo(s).</div>';
      } else btnNovo.disabled = false;

      Veiculos._renderLista();
    });
  },

  /* Maior km entre os abastecimentos do veiculo (empate resolvido pela
     data mais recente) â€” mesmo criterio ja usado em Manutencoes. */
  _ultimoAbastecimento: function (abastecimentosDoVeic) {
    var lista = (abastecimentosDoVeic || []).filter(function (a) { return Number(a.km) > 0; });
    if (!lista.length) return null;
    lista = lista.slice().sort(function (a, b) {
      if (Number(a.km) !== Number(b.km)) return Number(b.km) - Number(a.km);
      return String(b.data || '').localeCompare(String(a.data || ''));
    });
    return lista[0];
  },

  /* Desenha a lista respeitando o filtro do veiculo ativo GLOBAL
     (App.veiculoAtivoId). Separado de carregarLista() para poder ser
     chamado de novo (sem nova consulta ao Supabase) quando o usuario
     so troca o filtro na barra global, enquanto ja esta nesta pagina. */
  _renderLista: function () {
    var lista = document.getElementById('listaVeiculos');
    if (!lista) return;

    if (Veiculos.lista.length === 0) {
      lista.innerHTML = '<div class="vazio-veiculo"><span class="ms">directions_car</span>' +
        '<b>Nenhum veÃ­culo ainda</b><p>Adicione seu primeiro veÃ­culo.</p>' +
        '<button class="btn-novo" onclick="App.irParaFormVeiculo()"><span class="ms">add</span> Adicionar veÃ­culo</button></div>';
      return;
    }

    var exibir = App.veiculoAtivoId
      ? Veiculos.lista.filter(function (v) { return v.id === App.veiculoAtivoId; })
      : Veiculos.lista;

    if (!exibir.length) {
      lista.innerHTML = '<div class="vazio-veiculo"><span class="ms">filter_alt_off</span>' +
        '<b>VeÃ­culo nÃ£o encontrado</b><p>Selecione "Todos" na barra acima para ver a lista completa.</p></div>';
      return;
    }

    lista.innerHTML = exibir.map(Veiculos.cardHTML).join('');
  },

  cardHTML: function (v) {
    var cor = Veiculos.corDoVeiculo(v.cor);
    var icone = Veiculos.iconeDoTipo(v.tipo);
    var detalhes = [v.marca, v.modelo, v.ano].filter(function (x) { return x; }).join(' ');
    var st = (Veiculos._stats && Veiculos._stats[v.id]) || {};
    var kmLTxt = st.temConsumo ? st.kmL.toFixed(1).replace('.', ',') : 'â€”';
    var kmTanqueTxt = (st.temConsumo && st.kmTanque > 0) ? App.fmtNum(Math.round(st.kmTanque)) : 'â€”';
    var qtdAbast = st.qtdAbastecimentos || 0;
    var qtdManut = st.qtdManutencoes || 0;
    var qtdViagens = st.qtdViagens || 0;

    /* KM exibido: prioriza o ultimo abastecimento (dado mais recente e
       confiavel); se ainda nao houver nenhum, cai para o km informado
       no cadastro, deixando o rotulo claro sobre a origem do numero. */
    var kmLabel, kmValor;
    if (st.ultimoAbastecimento) {
      kmLabel = 'Ãšlt. abastec.';
      kmValor = App.fmtNum(st.ultimoAbastecimento.km) + ' km';
    } else {
      kmLabel = 'KM cadastro';
      kmValor = App.fmtNum(Number(v.kmInicial) || 0) + ' km';
    }

    return '<div class="card-veiculo" style="--cor-carro: ' + cor + '">' +
      '<div class="cv-topo">' +
        '<div class="cv-icone"><span class="ms">' + icone + '</span></div>' +
        '<div class="cv-info">' +
          '<b>' + App.esc(v.nome) + '</b>' +
          (detalhes ? '<small>' + App.esc(detalhes) + '</small>' : '') +
          '<span class="cv-placa">' + App.esc(v.placa || 'SEM PLACA') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="cv-numeros">' +
        '<div class="cv-numero"><b>' + kmValor + '</b><small>' + kmLabel + '</small></div>' +
        '<div class="cv-numero"><b>' + kmLTxt + '</b><small>km/L</small></div>' +
        '<div class="cv-numero"><b>' + kmTanqueTxt + '</b><small>km/Tanque</small></div>' +
      '</div>' +
      '<div class="cv-chips">' +
        '<span class="cv-chip"><span class="ms" style="color:#ef4444">local_gas_station</span>' + qtdAbast + ' abast.</span>' +
        '<span class="cv-chip"><span class="ms" style="color:#f59e0b">build</span>' + qtdManut + ' manut.</span>' +
        '<span class="cv-chip"><span class="ms" style="color:#22d3ee">luggage</span>' + qtdViagens + ' viagens</span>' +
        (v.fipeValor > 0 ? '<span class="cv-chip fipe"><span class="ms" style="color:#a78bfa">sell</span>R$ ' + App.fmtNum(v.fipeValor) + ' FIPE</span>' : '') +
      '</div>' +
      '<div class="cv-acoes">' +
        '<button class="cv-btn" onclick="App.irParaFormAbastecimento(null, \'' + v.id + '\')"><span class="ms" style="color:#ef4444">local_gas_station</span>Abastecer</button>' +
        '<button class="cv-btn" onclick="App.irParaFormManutencao(null, null, \'' + v.id + '\')"><span class="ms" style="color:#f59e0b">build</span>ManutenÃ§Ã£o</button>' +
        '<button class="cv-btn" onclick="Veiculos.abrirRevisoes(\'' + v.id + '\')"><span class="ms" style="color:#a78bfa">event_repeat</span>RevisÃµes</button>' +
      '</div>' +
      '<div class="cv-acoes-sec">' +
        '<button class="cv-btn-sec" onclick="App.irParaFormVeiculo(\'' + v.id + '\')"><span class="ms" style="color:#60a5fa">edit</span>Editar</button>' +
        '<button class="cv-btn-sec" onclick="Veiculos.abrirPlano(\'' + v.id + '\')"><span class="ms" style="color:#a78bfa">auto_awesome</span>Plano</button>' +
        '<button class="cv-btn-sec" onclick="Veiculos.abrirFipe(\'' + v.id + '\')"><span class="ms" style="color:#22d3ee">sell</span>FIPE</button>' +
        '<button class="cv-btn-sec" onclick="Veiculos.abrirCusto(\'' + v.id + '\')"><span class="ms" style="color:#22c55e">monitoring</span>Custo</button>' +
        '<button class="cv-btn-sec excluir" onclick="Veiculos.excluir(\'' + v.id + '\')"><span class="ms">delete</span>Excluir</button>' +
      '</div>' +
    '</div>';
  },
  abrirFormulario: function (id) {
    Veiculos._fipeConsultaFormValor = null; /* nova sessao de formulario: nenhum valor consultado ainda */
    if (id) {
      var achado = null;
      for (var i = 0; i < Veiculos.lista.length; i++) {
        if (Veiculos.lista[i].id === id) { achado = Veiculos.lista[i]; break; }
      }
      if (!achado) {
        sb.from('veiculos').select('*').eq('id', id).single().then(function (r) {
          if (r.data) { Veiculos.editando = r.data; Veiculos.renderForm(); }
        });
        return;
      }
      Veiculos.editando = achado;
    } else {
      Veiculos.editando = null;
    }
    Veiculos.renderForm();
  },
  renderForm: function () {
    var v = Veiculos.editando || {};
    var tipoSel = v.tipo || 'carro';
    var corSel = v.cor || 'azul';
    var combustivelSel = v.combustivel || 'Gasolina';
    var energeticosSel = Veiculos.editando
      ? EnergeticosVeiculo.doVeiculo(v)
      : EnergeticosVeiculo.baseDoTipo(combustivelSel, !!v.plugIn);
    Veiculos._energeticosForm = energeticosSel.slice();

    var tiposHtml = TIPOS_VEICULO.map(function (t) {
      return '<button type="button" class="tipo-opcao' + (t.id === tipoSel ? ' sel' : '') + '" ' +
        'data-tipo="' + t.id + '" onclick="Veiculos.selTipo(this)">' +
        '<span class="ms">' + t.icone + '</span><span>' + t.nome + '</span>' +
      '</button>';
    }).join('');

    var coresHtml = CORES_VEICULO.map(function (c) {
      return '<button type="button" class="cor-opcao' + (c.id === corSel ? ' sel' : '') + '" ' +
        'data-cor="' + c.id + '" style="background:' + c.hex + ';color:' + c.hex + '" ' +
        'onclick="Veiculos.selCor(this)"></button>';
    }).join('');

    var html =
      '<h2 class="form-titulo">' + (v.id ? 'Editar veÃ­culo' : 'Novo veÃ­culo') + '</h2>' +
      '<div class="campo-form"><label>Tipo de veÃ­culo</label><div class="seletor-tipo" id="seletorTipo">' + tiposHtml + '</div></div>' +
      '<div class="campo-form"><label>Cor de identificaÃ§Ã£o</label><div class="seletor-cor" id="seletorCor">' + coresHtml + '</div></div>' +
      '<div class="fipe-compacto">' +
        '<div class="fipe-compacto-header" onclick="Veiculos.toggleFipe()">' +
          '<span class="ms fipe-compacto-icone">auto_awesome</span>' +
          '<div class="fipe-compacto-txt"><b>Preencher pela tabela FIPE</b><small>Escolha a marca, modelo e ano â€” preenche sozinho e jÃ¡ salva o valor de mercado</small></div>' +
          '<span class="fipe-compacto-toggle" id="fipeToggleTxt">usar</span>' +
        '</div>' +
        '<div class="fipe-compacto-campos" id="fipeCampos">' +
          '<div class="campo-form"><label>Marca</label><select id="fipeMarca" onchange="Veiculos.fipeEscolherMarca()"><option value="">Carregando...</option></select></div>' +
          '<div class="campo-form"><label>Modelo</label><select id="fipeModelo" onchange="Veiculos.fipeEscolherModelo()" disabled><option>Escolha a marca primeiro</option></select></div>' +
          '<div class="campo-form"><label>Ano</label><select id="fipeAno" onchange="Veiculos.fipeEscolherAno()" disabled><option>Escolha o modelo primeiro</option></select></div>' +
          '<div id="fipeResultado"></div>' +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Nome / Apelido</label><input type="text" id="vNome" placeholder="Ex: Meu carro" value="' + App.esc(v.nome || '') + '" maxlength="50"></div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Placa</label><input type="text" id="vPlaca" placeholder="ABC1D23" value="' + App.esc(v.placa || '') + '" maxlength="8" style="text-transform:uppercase"></div>' +
        '<div class="campo-form"><label>Ano</label><input type="number" id="vAno" placeholder="2020" value="' + (v.ano || '') + '" min="1900" max="2100"></div>' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Marca</label><input type="text" id="vMarca" placeholder="Volkswagen" value="' + App.esc(v.marca || '') + '"></div>' +
        '<div class="campo-form"><label>Modelo</label><input type="text" id="vModelo" placeholder="Gol" value="' + App.esc(v.modelo || '') + '"></div>' +
      '</div>' +
      '<div class="campo-form"><label>CombustÃ­vel / configuraÃ§Ã£o do veÃ­culo</label>' +
        '<select id="vCombustivel" onchange="Veiculos.aplicarTipoCombustivel(true)">' +
          ['Gasolina','Etanol','Flex','Diesel','GNV','ElÃ©trico','HÃ­brido'].map(function (c) {
            return '<option value="' + c + '"' + (combustivelSel === c ? ' selected' : '') + '>' + c + '</option>';
          }).join('') +
        '</select>' +
        '<small>Flex e HÃ­brido identificam corretamente o veÃ­culo. Os energÃ©ticos usados sÃ£o definidos abaixo.</small>' +
      '</div>' +
      '<div class="campo-form"><label>EnergÃ©ticos aceitos</label>' +
        '<div id="seletorEnergeticos"></div>' +
        '<small id="ajudaEnergeticos"></small>' +
      '</div>' +
      '<div id="blocoPlugIn" class="campo-form oculto">' +
        '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;text-transform:none;font-size:13px">' +
          '<input type="checkbox" id="vPlugIn"' + (v.plugIn ? ' checked' : '') + ' onchange="Veiculos.alterarPlugIn()" style="width:auto;transform:scale(1.3)">' +
          '<span>HÃ­brido plug-in (pode ser recarregado na tomada)</span>' +
        '</label>' +
        '<small>HÃ­brido convencional recarrega a bateria internamente. Plug-in aceita gasolina e recarga elÃ©trica.</small>' +
      '</div>' +
      '<div id="blocoCapacidades"></div>' +
      '<div class="campo-form"><label>KM atual do painel</label><input type="number" id="vKm" placeholder="0" value="' + (v.kmInicial || '') + '" min="0"></div>' +
      '<div class="form-acoes">' +
        '<button class="btn-cancelar-form" onclick="App.irPara(\'veiculos\')">Cancelar</button>' +
        '<button class="btn-salvar-form" id="btnSalvarForm" onclick="Veiculos.salvar()">' + (v.id ? 'Salvar alteraÃ§Ãµes' : 'Cadastrar veÃ­culo') + '</button>' +
      '</div>';

    document.getElementById('formVeiculoContainer').innerHTML = html;
    Veiculos.renderSeletorEnergeticos();
    Veiculos.atualizarCamposEnergeticos();
  },

  aplicarTipoCombustivel: function (redefinirEnergeticos) {
    var sel = document.getElementById('vCombustivel');
    if (!sel) return;
    var tipo = sel.value;
    var plug = document.getElementById('vPlugIn');
    if (tipo !== 'HÃ­brido' && plug) plug.checked = false;
    var plugIn = tipo === 'HÃ­brido' && !!(plug && plug.checked);
    var anterior = redefinirEnergeticos ? [] : (Veiculos._energeticosForm || []);
    Veiculos._energeticosForm = EnergeticosVeiculo.normalizar(tipo, plugIn, anterior);
    Veiculos.renderSeletorEnergeticos();
    Veiculos.atualizarCamposEnergeticos();
  },

  alterarPlugIn: function () {
    var sel = document.getElementById('vCombustivel');
    var plug = document.getElementById('vPlugIn');
    if (!sel || sel.value !== 'HÃ­brido' || !plug) return;
    Veiculos._energeticosForm = EnergeticosVeiculo.baseDoTipo('HÃ­brido', plug.checked);
    Veiculos.renderSeletorEnergeticos();
    Veiculos.atualizarCamposEnergeticos();
  },

  renderSeletorEnergeticos: function () {
    var container = document.getElementById('seletorEnergeticos');
    if (!container) return;
    var tipoEl = document.getElementById('vCombustivel');
    var tipo = tipoEl ? tipoEl.value : 'Gasolina';
    var plugEl = document.getElementById('vPlugIn');
    var plugIn = tipo === 'HÃ­brido' && !!(plugEl && plugEl.checked);
    Veiculos._energeticosForm = EnergeticosVeiculo.normalizar(tipo, plugIn, Veiculos._energeticosForm || []);
    var base = EnergeticosVeiculo.baseDoTipo(tipo, plugIn);
    var opcionais = EnergeticosVeiculo.adaptaveisDoTipo(tipo);

    function card(e, fixo, selecionado) {
      var fundo = selecionado ? e.cor + '26' : 'var(--bg2,#111c33)';
      var borda = selecionado ? e.cor : 'var(--linha,#26365c)';
      var texto = selecionado ? e.cor : 'var(--txt2,#93a4c8)';
      var click = fixo ? '' : ' onclick="Veiculos.toggleEnergetico(this)"';
      var cursor = fixo ? 'default' : 'pointer';
      return '<button type="button" class="energetico-opcao' + (selecionado ? ' sel' : '') + (fixo ? ' fixo' : '') + '"' + click +
        ' data-energetico="' + e.id + '" data-cor="' + e.cor + '" data-fixo="' + (fixo ? '1' : '0') + '" ' +
        'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:82px;padding:11px 4px;border-radius:12px;cursor:' + cursor + ';font-family:inherit;text-align:center;transition:.15s;background:' + fundo + ';border:2px solid ' + borda + ';color:' + texto + '">' +
        '<span class="ms" style="font-size:25px;line-height:1;color:' + e.cor + '">' + e.icone + '</span>' +
        '<span style="font-size:11px;font-weight:700">' + e.id + '</span>' +
        '<small style="font-size:9.5px;opacity:.75">' + e.unidade + (fixo ? ' Â· original' : ' Â· adaptaÃ§Ã£o') + '</small>' +
      '</button>';
    }

    var html = '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">';
    base.forEach(function (id) { html += card(EnergeticosVeiculo.porId(id), true, true); });
    opcionais.forEach(function (id) {
      html += card(EnergeticosVeiculo.porId(id), false, Veiculos._energeticosForm.indexOf(id) > -1);
    });
    html += '</div>';
    container.innerHTML = html;

    var ajuda = document.getElementById('ajudaEnergeticos');
    if (ajuda) {
      if (opcionais.length) ajuda.textContent = 'Os energÃ©ticos originais ficam fixos. Marque GNV somente se o veÃ­culo possuir kit instalado.';
      else if (tipo === 'HÃ­brido') ajuda.textContent = plugIn ? 'HÃ­brido plug-in: gasolina e recarga elÃ©trica.' : 'HÃ­brido convencional: abastece gasolina e recarrega a bateria internamente.';
      else ajuda.textContent = 'Este tipo nÃ£o possui adaptaÃ§Ã£o de energÃ©tico compatÃ­vel no CarWay.';
    }
  },

  toggleEnergetico: function (el) {
    if (el.getAttribute('data-fixo') === '1') return;
    var id = el.getAttribute('data-energetico');
    var lista = (Veiculos._energeticosForm || []).slice();
    var pos = lista.indexOf(id);
    if (pos > -1) lista.splice(pos, 1); else lista.push(id);
    Veiculos._energeticosForm = lista;
    Veiculos.renderSeletorEnergeticos();
    Veiculos.atualizarCamposEnergeticos();
  },

  _energeticosMarcados: function () {
    return (Veiculos._energeticosForm || []).slice();
  },

  atualizarCamposEnergeticos: function () {
    var container = document.getElementById('blocoCapacidades');
    if (!container) return;
    var v = Veiculos.editando || {};
    var tipoEl = document.getElementById('vCombustivel');
    var tipo = tipoEl ? tipoEl.value : (v.combustivel || 'Gasolina');
    var marcados = Veiculos._energeticosMarcados();
    var temLiquido = marcados.some(function (e) { return ['Gasolina','Etanol','Diesel'].indexOf(e) > -1; });
    var temGnv = marcados.indexOf('GNV') > -1;
    var temEletrico = marcados.indexOf('ElÃ©trico') > -1;
    var blocoPlug = document.getElementById('blocoPlugIn');
    if (blocoPlug) blocoPlug.classList.toggle('oculto', tipo !== 'HÃ­brido');

    var atualTanque = document.getElementById('vTanque');
    var atualGnv = document.getElementById('vCapacidadeGnv');
    var atualBateria = document.getElementById('vCapacidadeBateria');
    var valorTanque = atualTanque ? atualTanque.value : (temLiquido ? (v.tanque || '') : '');
    var valorGnv = atualGnv ? atualGnv.value : (v.capacidadeGnv || (!temLiquido && temGnv ? (v.tanque || '') : ''));
    var valorBateria = atualBateria ? atualBateria.value : (v.capacidadeBateria || (!temLiquido && !temGnv && temEletrico ? (v.tanque || '') : ''));

    var html = '';
    if (temLiquido) html += '<div class="campo-form"><label><span class="ms" style="color:#ef4444;font-size:16px;vertical-align:middle">local_gas_station</span> Tanque de combustÃ­vel (litros)</label><input type="number" id="vTanque" placeholder="50" value="' + valorTanque + '" min="0" step="0.5"></div>';
    if (temGnv) html += '<div class="campo-form"><label><span class="ms" style="color:#22d3ee;font-size:16px;vertical-align:middle">propane_tank</span> Capacidade do cilindro de GNV (mÂ³)</label><input type="number" id="vCapacidadeGnv" placeholder="15" value="' + valorGnv + '" min="0" step="0.1"></div>';
    if (temEletrico) html += '<div class="campo-form"><label><span class="ms" style="color:#22c55e;font-size:16px;vertical-align:middle">ev_station</span> Capacidade da bateria (kWh)</label><input type="number" id="vCapacidadeBateria" placeholder="60" value="' + valorBateria + '" min="0" step="0.1"></div>';
    container.innerHTML = html;
  },

  selTipo: function (el) {
    var ops = document.querySelectorAll('#seletorTipo .tipo-opcao');
    for (var i = 0; i < ops.length; i++) ops[i].classList.remove('sel');
    el.classList.add('sel');
    Veiculos._resetFipeParaNovoTipo();
  },
  selCor: function (el) {
    var ops = document.querySelectorAll('#seletorCor .cor-opcao');
    for (var i = 0; i < ops.length; i++) ops[i].classList.remove('sel');
    el.classList.add('sel');
  },

  /* Cada tipo de veiculo usa uma tabela FIPE diferente (carros/motos/
     caminhoes). Sem isso, ao trocar o tipo, o dropdown de marcas
     continuava mostrando as marcas do tipo ANTERIOR (o "preso" que
     exigia dar refresh). Agora, ao trocar o tipo, zeramos o cache e,
     se o painel da FIPE ja estiver aberto, recarregamos as marcas
     automaticamente para o tipo novo â€” sem precisar fechar/reabrir. */
  _resetFipeParaNovoTipo: function () {
    Veiculos.fipe = { tipo: '', marcas: [], modelos: [], anos: [] };
    Veiculos._fipeConsultaFormValor = null; /* consulta anterior nao vale mais para o novo tipo */
    var selMarca = document.getElementById('fipeMarca');
    var selModelo = document.getElementById('fipeModelo');
    var selAno = document.getElementById('fipeAno');
    var resultado = document.getElementById('fipeResultado');
    if (selMarca) selMarca.innerHTML = '<option value="">Selecione...</option>';
    if (selModelo) { selModelo.innerHTML = '<option>Escolha a marca primeiro</option>'; selModelo.disabled = true; }
    if (selAno) { selAno.innerHTML = '<option>Escolha o modelo primeiro</option>'; selAno.disabled = true; }
    if (resultado) resultado.innerHTML = '';
    var campos = document.getElementById('fipeCampos');
    if (campos && campos.classList.contains('aberto')) {
      Veiculos.fipeCarregarMarcas();
    }
  },

  salvar: function () {
    var nome = document.getElementById('vNome').value.trim();
    if (!nome) { App.toast('Informe o nome', 'erro'); return; }

    var tipoEl = document.querySelector('#seletorTipo .tipo-opcao.sel');
    var corEl = document.querySelector('#seletorCor .cor-opcao.sel');
    var combustivel = document.getElementById('vCombustivel').value;
    var energeticos = Veiculos._energeticosMarcados();
    if (!energeticos.length) { App.toast('Escolha pelo menos um energÃ©tico', 'erro'); return; }

    var plugEl = document.getElementById('vPlugIn');
    var plugIn = combustivel === 'HÃ­brido' && !!(plugEl && plugEl.checked);
    if (plugIn && energeticos.indexOf('ElÃ©trico') === -1) {
      App.toast('HÃ­brido plug-in precisa aceitar o energÃ©tico ElÃ©trico', 'erro'); return;
    }

    var elTanque = document.getElementById('vTanque');
    var elGnv = document.getElementById('vCapacidadeGnv');
    var elBateria = document.getElementById('vCapacidadeBateria');
    var capacidadeTanque = elTanque ? (Number(elTanque.value) || 0) : 0;
    var capacidadeGnv = elGnv ? (Number(elGnv.value) || 0) : 0;
    var capacidadeBateria = elBateria ? (Number(elBateria.value) || 0) : 0;
    var capacidadePrincipal = capacidadeTanque || capacidadeGnv || capacidadeBateria;

    var reg = {
      organizacaoId: orgAtual.id,
      responsavelId: usuarioAtual.id,
      nome: nome,
      tipo: tipoEl ? tipoEl.getAttribute('data-tipo') : 'carro',
      cor: corEl ? corEl.getAttribute('data-cor') : 'azul',
      placa: document.getElementById('vPlaca').value.trim().toUpperCase(),
      ano: Number(document.getElementById('vAno').value) || null,
      marca: document.getElementById('vMarca').value.trim(),
      modelo: document.getElementById('vModelo').value.trim(),
      combustivel: combustivel,
      energeticos: energeticos.join(','),
      plugIn: plugIn,
      tanque: capacidadePrincipal,
      capacidadeGnv: capacidadeGnv,
      capacidadeBateria: capacidadeBateria,
      kmInicial: Number(document.getElementById('vKm').value) || 0,
      ativo: 'SIM'
    };

    if (Veiculos._fipeConsultaFormValor !== null) reg.fipeValor = Veiculos._fipeConsultaFormValor;

    var btn = document.getElementById('btnSalvarForm');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    var promise;
    if (Veiculos.editando && Veiculos.editando.id) promise = sb.from('veiculos').update(reg).eq('id', Veiculos.editando.id);
    else { reg.id = 'VEI_' + App.uid(); promise = sb.from('veiculos').insert(reg); }

    promise.then(function (r) {
      btn.disabled = false;
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        btn.textContent = Veiculos.editando ? 'Salvar alteraÃ§Ãµes' : 'Cadastrar veÃ­culo';
        return;
      }
      App.toast(Veiculos.editando ? 'Atualizado!' : 'Cadastrado!', 'ok');
      if (App.atualizarBarraVeiculoGlobal) App.atualizarBarraVeiculoGlobal();
      App.irPara('veiculos');
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = Veiculos.editando ? 'Salvar alteraÃ§Ãµes' : 'Cadastrar veÃ­culo';
      console.error('CarWay - erro ao salvar veÃ­culo:', e);
      App.toast('Erro ao salvar veÃ­culo', 'erro');
    });
  },

  excluir: function (id) {
    var veic = Veiculos.lista.filter(function (v) { return v.id === id; })[0] || {};
    var nome = veic.nome || 'este veÃ­culo';
    App.confirmar({
      titulo: 'Excluir veÃ­culo',
      mensagem: 'O veÃ­culo <b>' + App.esc(nome) + '</b> serÃ¡ excluÃ­do permanentemente, ' +
        'junto com <b>todos os abastecimentos, manutenÃ§Ãµes, viagens e documentos</b> vinculados a ele.',
      textoBotao: 'Excluir veÃ­culo',
      tipo: 'perigo',
      icone: 'directions_car',
      aoConfirmar: function () {
        sb.from('veiculos').delete().eq('id', id).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('VeÃ­culo excluÃ­do', 'ok');
          /* Se o veiculo excluido era o filtro ativo na barra global,
             volta para "Todos" antes de recarregar a lista. */
          if (App.veiculoAtivoId === id) {
            App.veiculoAtivoId = null;
            if (App._salvarVeiculoAtivo) App._salvarVeiculoAtivo();
          }
          if (App.atualizarBarraVeiculoGlobal) App.atualizarBarraVeiculoGlobal();
          Veiculos.carregarLista();
        });
      }
    });
  },
  toggleFipe: function () {
    var campos = document.getElementById('fipeCampos');
    var txt = document.getElementById('fipeToggleTxt');
    if (campos.classList.contains('aberto')) { campos.classList.remove('aberto'); txt.textContent = 'usar'; return; }
    campos.classList.add('aberto'); txt.textContent = 'ocultar';
    if (Veiculos.fipe.marcas.length === 0) Veiculos.fipeCarregarMarcas();
  },
  fipeCarregarMarcas: function () {
    var tipoEl = document.querySelector('#seletorTipo .tipo-opcao.sel');
    var tipo = tipoEl ? tipoEl.getAttribute('data-tipo') : 'carro';
    var fipeTipo = (tipo === 'moto') ? 'motorcycles' : (tipo === 'caminhao' || tipo === 'onibus') ? 'trucks' : 'cars';
    var sel = document.getElementById('fipeMarca');
    sel.innerHTML = '<option>Carregando...</option>';
    fetch('https://fipe.parallelum.com.br/api/v2/' + fipeTipo + '/brands')
      .then(function (r) { return r.json(); })
      .then(function (marcas) {
        Veiculos.fipe.tipo = fipeTipo;
        Veiculos.fipe.marcas = marcas || [];
        sel.innerHTML = '<option value="">Selecione...</option>' +
          Veiculos.fipe.marcas.map(function (m) {
            return '<option value="' + m.code + '">' + App.esc(m.name) + '</option>';
          }).join('');
      })
      .catch(function () { sel.innerHTML = '<option value="">Erro</option>'; });
  },
  fipeEscolherMarca: function () {
    var cod = document.getElementById('fipeMarca').value;
    if (!cod) return;
    var sel = document.getElementById('fipeModelo');
    sel.disabled = true; sel.innerHTML = '<option>Carregando...</option>';
    fetch('https://fipe.parallelum.com.br/api/v2/' + Veiculos.fipe.tipo + '/brands/' + cod + '/models')
      .then(function (r) { return r.json(); })
      .then(function (mods) {
        Veiculos.fipe.modelos = mods || [];
        sel.disabled = false;
        sel.innerHTML = '<option value="">Selecione...</option>' +
          Veiculos.fipe.modelos.map(function (m) {
            return '<option value="' + m.code + '">' + App.esc(m.name) + '</option>';
          }).join('');
        document.getElementById('fipeAno').disabled = true;
        document.getElementById('fipeAno').innerHTML = '<option>Escolha o modelo</option>';
      });
  },
  fipeEscolherModelo: function () {
    var m = document.getElementById('fipeMarca').value;
    var mo = document.getElementById('fipeModelo').value;
    if (!m || !mo) return;
    var sel = document.getElementById('fipeAno');
    sel.disabled = true; sel.innerHTML = '<option>Carregando...</option>';
    fetch('https://fipe.parallelum.com.br/api/v2/' + Veiculos.fipe.tipo + '/brands/' + m + '/models/' + mo + '/years')
      .then(function (r) { return r.json(); })
      .then(function (anos) {
        Veiculos.fipe.anos = anos || [];
        sel.disabled = false;
        sel.innerHTML = '<option value="">Selecione...</option>' +
          Veiculos.fipe.anos.map(function (a) {
            return '<option value="' + a.code + '">' + App.esc(a.name) + '</option>';
          }).join('');
      });
  },
  fipeEscolherAno: function () {
    var m = document.getElementById('fipeMarca').value;
    var mo = document.getElementById('fipeModelo').value;
    var a = document.getElementById('fipeAno').value;
    if (!m || !mo || !a) return;
    var div = document.getElementById('fipeResultado');
    div.innerHTML = '<div class="fipe-aviso">Consultando...</div>';
    fetch('https://fipe.parallelum.com.br/api/v2/' + Veiculos.fipe.tipo + '/brands/' + m + '/models/' + mo + '/years/' + a)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        document.getElementById('vMarca').value = d.brand || '';
        document.getElementById('vModelo').value = d.model || '';
        document.getElementById('vAno').value = d.modelYear || '';
        var comb = Veiculos.fipeTraduzCombustivel(d.fuel);
        var sel = document.getElementById('vCombustivel');
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === comb) { sel.selectedIndex = i; break; }
        }
        var cNome = document.getElementById('vNome');
        if (cNome && !cNome.value) cNome.value = String(d.model || '').split(' ')[0];
        Veiculos.aplicarTipoCombustivel(true);
        Veiculos._fipeConsultaFormValor = Veiculos._parseFipePreco(d.price);
        div.innerHTML = '<div class="fipe-aviso">' +
          'âœ“ <b>' + App.esc(d.brand + ' ' + d.model) + '</b><br>' +
          d.modelYear + ' Â· ' + App.esc(d.fuel) + '<br>' +
          'Valor FIPE: <b>' + App.esc(d.price) + '</b> <small>(serÃ¡ salvo com o veÃ­culo)</small><br>' +
          'Ref: ' + App.esc(d.referenceMonth) +
        '</div>';
      })
      .catch(function () { div.innerHTML = '<div class="fipe-erro">Erro</div>'; });
  },

  fipeTraduzCombustivel: function (f) {
    if (!f) return 'Gasolina';
    var s = f.toLowerCase();
    if (s.indexOf('diesel') > -1) return 'Diesel';
    if (s.indexOf('flex') > -1) return 'Flex';
    if (s.indexOf('Ã¡lcool') > -1 || s.indexOf('alcool') > -1) return 'Etanol';
    if (s.indexOf('elÃ©tr') > -1 || s.indexOf('eletr') > -1) return 'ElÃ©trico';
    if (s.indexOf('hÃ­br') > -1 || s.indexOf('hibr') > -1) return 'HÃ­brido';
    if (s.indexOf('gnv') > -1 || s.indexOf('gÃ¡s') > -1) return 'GNV';
    return 'Gasolina';
  },

  /* ---- "RevisÃµes": abre Manutencao filtrado para este veiculo, na
     aba Monitoramento (status vencido/atencao/ok de cada item). ---- */
  abrirRevisoes: function (veiculoId) {
    App.definirVeiculoAtivo(veiculoId);
    Manutencoes.aba = 'monitor';
    App.irPara('manutencao');
  },

  /* ---- "Plano": abre Manutencao filtrado para este veiculo, direto
     na aba Planos (lista de itens do plano de manutencao). ---- */
  abrirPlano: function (veiculoId) {
    App.definirVeiculoAtivo(veiculoId);
    Manutencoes.aba = 'planos';
    App.irPara('manutencao');
  },

  /* ---- "FIPE": consulta/atualiza o valor de mercado do veiculo,
     salvando em veiculos.fipeValor. Reaproveita a mesma API publica
     ja usada no formulario, so que num modal, sem precisar editar
     o veiculo inteiro. ---- */
  abrirFipe: function (veiculoId) {
    var v = Veiculos.lista.filter(function (x) { return x.id === veiculoId; })[0];
    if (!v) return;

    var fipeTipo = (v.tipo === 'moto') ? 'motorcycles' : (v.tipo === 'caminhao' || v.tipo === 'onibus') ? 'trucks' : 'cars';
    Veiculos._fipeModal = { tipo: fipeTipo, marcas: [], modelos: [], anos: [], veiculoId: veiculoId };

    var html =
      (v.fipeValor > 0
        ? '<div class="fipe-aviso" style="margin-bottom:14px">Valor FIPE salvo atualmente: <b>' + App.moeda(v.fipeValor) + '</b></div>'
        : '') +
      '<div class="campo-form"><label>Marca</label>' +
        '<select id="modalFipeMarca" onchange="Veiculos._modalFipeMarca()"><option>Carregando...</option></select>' +
      '</div>' +
      '<div class="campo-form"><label>Modelo</label>' +
        '<select id="modalFipeModelo" onchange="Veiculos._modalFipeModelo()" disabled><option>Escolha a marca primeiro</option></select>' +
      '</div>' +
      '<div class="campo-form"><label>Ano</label>' +
        '<select id="modalFipeAno" onchange="Veiculos._modalFipeAno()" disabled><option>Escolha o modelo primeiro</option></select>' +
      '</div>' +
      '<div id="modalFipeResultado"></div>';

    App.abrirModal('Consultar FIPE Â· ' + v.nome, html, null);

    var sel = document.getElementById('modalFipeMarca');
    fetch('https://fipe.parallelum.com.br/api/v2/' + fipeTipo + '/brands')
      .then(function (r) { return r.json(); })
      .then(function (marcas) {
        Veiculos._fipeModal.marcas = marcas || [];
        sel.innerHTML = '<option value="">Selecione...</option>' +
          Veiculos._fipeModal.marcas.map(function (m) {
            return '<option value="' + m.code + '">' + App.esc(m.name) + '</option>';
          }).join('');
      })
      .catch(function () { sel.innerHTML = '<option value="">Erro ao carregar</option>'; });
  },

  _modalFipeMarca: function () {
    var cod = document.getElementById('modalFipeMarca').value;
    if (!cod) return;
    var sel = document.getElementById('modalFipeModelo');
    sel.disabled = true; sel.innerHTML = '<option>Carregando...</option>';
    fetch('https://fipe.parallelum.com.br/api/v2/' + Veiculos._fipeModal.tipo + '/brands/' + cod + '/models')
      .then(function (r) { return r.json(); })
      .then(function (mods) {
        Veiculos._fipeModal.modelos = mods || [];
        sel.disabled = false;
        sel.innerHTML = '<option value="">Selecione...</option>' +
          Veiculos._fipeModal.modelos.map(function (m) {
            return '<option value="' + m.code + '">' + App.esc(m.name) + '</option>';
          }).join('');
        var selAno = document.getElementById('modalFipeAno');
        selAno.disabled = true;
        selAno.innerHTML = '<option>Escolha o modelo</option>';
      });
  },

  _modalFipeModelo: function () {
    var m = document.getElementById('modalFipeMarca').value;
    var mo = document.getElementById('modalFipeModelo').value;
    if (!m || !mo) return;
    var sel = document.getElementById('modalFipeAno');
    sel.disabled = true; sel.innerHTML = '<option>Carregando...</option>';
    fetch('https://fipe.parallelum.com.br/api/v2/' + Veiculos._fipeModal.tipo + '/brands/' + m + '/models/' + mo + '/years')
      .then(function (r) { return r.json(); })
      .then(function (anos) {
        Veiculos._fipeModal.anos = anos || [];
        sel.disabled = false;
        sel.innerHTML = '<option value="">Selecione...</option>' +
          Veiculos._fipeModal.anos.map(function (a) {
            return '<option value="' + a.code + '">' + App.esc(a.name) + '</option>';
          }).join('');
      });
  },

  _modalFipeAno: function () {
    var m = document.getElementById('modalFipeMarca').value;
    var mo = document.getElementById('modalFipeModelo').value;
    var a = document.getElementById('modalFipeAno').value;
    if (!m || !mo || !a) return;
    var div = document.getElementById('modalFipeResultado');
    div.innerHTML = '<div class="fipe-aviso">Consultando...</div>';
    fetch('https://fipe.parallelum.com.br/api/v2/' + Veiculos._fipeModal.tipo + '/brands/' + m + '/models/' + mo + '/years/' + a)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var valorNumerico = Veiculos._parseFipePreco(d.price);
        Veiculos._fipeModal.valorConsultado = valorNumerico;
        div.innerHTML = '<div class="fipe-aviso">' +
          'âœ“ <b>' + App.esc(d.brand + ' ' + d.model) + '</b><br>' +
          d.modelYear + ' Â· ' + App.esc(d.fuel) + '<br>' +
          'Valor FIPE: <b>' + App.esc(d.price) + '</b><br>' +
          'Ref: ' + App.esc(d.referenceMonth) +
        '</div>' +
        '<button class="btn-salvar-form" style="width:100%;margin-top:10px" onclick="Veiculos._salvarFipeModal(' + valorNumerico + ')">' +
          'Salvar valor FIPE neste veÃ­culo' +
        '</button>';
      })
      .catch(function () { div.innerHTML = '<div class="fipe-erro">Erro ao consultar</div>'; });
  },

  /* Converte "R$ 45.000,00" (texto retornado pela API da FIPE) para
     numero (45000.00), mantendo apenas digitos e a virgula decimal. */
  _parseFipePreco: function (str) {
    if (!str) return 0;
    var limpo = String(str).replace(/[^0-9,]/g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
  },

  _salvarFipeModal: function (valor) {
    var veiculoId = Veiculos._fipeModal.veiculoId;
    sb.from('veiculos').update({ fipeValor: valor }).eq('id', veiculoId).then(function (r) {
      if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
      App.toast('Valor FIPE salvo!', 'ok');
      App.fecharModal();
      Veiculos.carregarLista();
    });
  },

  /* ---- "Custo": soma tudo que foi gasto com este veiculo especifico
     (abastecimentos + despesas + manutencoes), desde sempre, com o
     detalhamento por categoria â€” igual ao hub "Onde vai meu dinheiro"
     do Painel, so que filtrado para UM unico veiculo. ---- */
  abrirCusto: function (veiculoId) {
    var v = Veiculos.lista.filter(function (x) { return x.id === veiculoId; })[0];
    if (!v) return;

    App.abrirModal('Custo total Â· ' + v.nome,
      '<div style="text-align:center;padding:20px 0"><span class="ms" style="font-size:36px;opacity:.5">hourglass_top</span>' +
      '<p style="color:var(--txt2);margin-top:10px">Calculando...</p></div>', null);

    Promise.all([
      sb.from('abastecimentos').select('valorTotal').eq('organizacaoId', orgAtual.id).eq('veiculoId', veiculoId),
      sb.from('despesas').select('valor').eq('organizacaoId', orgAtual.id).eq('veiculoId', veiculoId),
      sb.from('manutencoes').select('custo').eq('organizacaoId', orgAtual.id).eq('veiculoId', veiculoId)
    ]).then(function (r) {
      var totalAbs = (r[0].data || []).reduce(function (s, x) { return s + (Number(x.valorTotal) || 0); }, 0);
      var totalDesp = (r[1].data || []).reduce(function (s, x) { return s + (Number(x.valor) || 0); }, 0);
      var totalManut = (r[2].data || []).reduce(function (s, x) { return s + (Number(x.custo) || 0); }, 0);
      var total = totalAbs + totalDesp + totalManut;

      if (total <= 0) {
        App.abrirModal('Custo total Â· ' + v.nome,
          '<div style="text-align:center;padding:20px 0;color:var(--txt2)"><span class="ms" style="font-size:48px;opacity:.5">monitoring</span>' +
          '<p style="margin-top:12px">Nenhum gasto lanÃ§ado ainda para este veÃ­culo.</p></div>', null);
        return;
      }

      var linhas = [
        { nome: 'CombustÃ­vel', valor: totalAbs, cor: '#ef4444' },
        { nome: 'Despesas', valor: totalDesp, cor: '#22c55e' },
        { nome: 'ManutenÃ§Ã£o', valor: totalManut, cor: '#f59e0b' }
      ];

      var html = '<div style="display:flex;flex-direction:column;gap:14px">' +
        linhas.map(function (l) {
          var pct = total > 0 ? Math.round((l.valor / total) * 100) : 0;
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
          '<b>Total investido</b><b>' + App.moeda(total) + '</b>' +
        '</div>' +
      '</div>';

      App.abrirModal('Custo total Â· ' + v.nome, html, null);
    }).catch(function (e) {
      console.error('CarWay custo veiculo:', e);
      App.abrirModal('Custo total Â· ' + v.nome, '<p style="text-align:center;color:var(--txt2)">Erro ao calcular.</p>', null);
    });
  },

  corDoVeiculo: function (id) {
    for (var i = 0; i < CORES_VEICULO.length; i++) if (CORES_VEICULO[i].id === id) return CORES_VEICULO[i].hex;
    return '#3b82f6';
  },
  iconeDoTipo: function (id) {
    for (var i = 0; i < TIPOS_VEICULO.length; i++) if (TIPOS_VEICULO[i].id === id) return TIPOS_VEICULO[i].icone;
    return 'directions_car';
  }
};
