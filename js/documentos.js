/* APP_VERSION: v1.1 - leitura e gravação offline */

/* =====================================================================
   CARWAY - DOCUMENTOS (CRLV, IPVA, Seguro, Vistoria, CNH etc.)
   Segue o mesmo padrão de página das demais seções (Veiculos,
   Abastecimentos, Despesas, Manutencoes): lista em página própria
   (#pg-documentos) + formulário em página própria (#pg-documento-form),
   sem uso de modal para o CRUD completo.

   Tabela 'documentos' (colunas herdadas do schema original do
   Apps Script): id, organizacaoId, usuarioId, veiculoId, tipo, numero,
   dataEmissao, dataVencimento, valor, status, arquivoUrl, obs.
   ===================================================================== */

var TIPOS_DOCUMENTO = [
  'CRLV / Licenciamento', 'IPVA', 'Seguro obrigatório (DPVAT)',
  'Seguro particular', 'Vistoria / Inspeção veicular', 'CNH do condutor', 'Outros'
];

var Documentos = {
  lista: [],
  veiculos: [],
  editando: null,
  _salvando: false,

  /* =========================================================
     CARREGAR LISTA
     ========================================================= */
  carregarLista: async function () {
    var el = document.getElementById('listaDocumentos');
    if (!el) return;
    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';
    var dados = null;
    if (navigator.onLine) {
      try {
        var r = await Promise.all([
          sb.from('veiculos').select('id, nome, placa').eq('organizacaoId', orgAtual.id).order('nome'),
          sb.from('documentos').select('*').eq('organizacaoId', orgAtual.id)
        ]);
        if (r[0].error || r[1].error) throw (r[0].error || r[1].error);
        dados = { veiculos: r[0].data || [], documentos: r[1].data || [] };
        Documentos._salvarColecao('documentos-pagina', dados);
      } catch (erro) {
        console.warn('CarWay documentos - usando dados salvos no aparelho:', erro);
        dados = null;
      }
    }
    if (!dados) {
      var cache = await Documentos._lerColecao('documentos-pagina', null) || {};
      dados = {
        veiculos: (Array.isArray(cache.veiculos) && cache.veiculos.length)
          ? cache.veiculos
          : await Documentos._lerColecao('veiculos', []),
        documentos: Array.isArray(cache.documentos) ? cache.documentos : []
      };
    }
    Documentos.veiculos = dados.veiculos || [];
    var documentos = await Documentos._mesclarPendentes(dados.documentos, 'documentos');
    Documentos.lista = documentos.map(function (d) {
      var st = App.statusDocumento(d.dataVencimento);
      return Object.assign({}, d, { _status: st.status, _dias: st.dias, _motivo: st.motivo });
    });
    /* Atualiza também o cache leve usado pelo hub do Painel. */
    App._documentosCache = { documentos: Documentos.lista };
    if (Documentos.veiculos.length === 0) {
      el.innerHTML =
        '<div class="vazio-veiculo">' +
          '<span class="ms">directions_car</span>' +
          '<b>Cadastre um veículo primeiro</b>' +
          '<p>Documentos são vinculados a um veículo.</p>' +
          '<button class="btn-novo" onclick="App.irParaFormVeiculo()">' +
            '<span class="ms">add</span> Cadastrar veículo' +
          '</button>' +
        '</div>';
      return;
    }
    Documentos.renderPagina();
  },
  /* =========================================================
     REDE E PENDENCIAS OFFLINE (Lote 03)
     ========================================================= */
  _semRede: function (acao) {
    if (navigator.onLine) return false;
    App.toast((acao || 'Esta ação') + ' exige conexão com a internet.', 'erro');
    return true;
  },
  _pendenteBloqueado: function (registro) {
    if (!registro || !registro._offlinePendente) return false;
    App.toast('Este lançamento ainda não foi sincronizado. Aguarde o envio para excluir.', 'erro');
    return true;
  },
  /* Aplica sobre a lista os lançamentos ainda guardados na fila offline
     (inclusões e edições), para que continuem visíveis após recarregar. */
  _mesclarPendentes: async function (lista, tabela) {
    var saida = (lista || []).slice();
    if (typeof Offline === 'undefined' || !Offline.listarPendentes) return saida;
    var pendentes = [];
    try { pendentes = await Offline.listarPendentes(); } catch (e) { return saida; }
    var posicao = {};
    saida.forEach(function (x, i) { if (x && x.id) posicao[x.id] = i; });
    pendentes.forEach(function (item) {
      if (item.tabela !== tabela || !item.registro || item.operacao === 'delete') return;
      var id = item.registroId || item.registro.id;
      if (!id) return;
      var marca = { id: id, _offlinePendente: true, _offlineFilaId: item.id };
      if (posicao[id] !== undefined) {
        saida[posicao[id]] = Object.assign({}, saida[posicao[id]], item.registro, marca);
      } else if (item.operacao === 'insert' || item.operacao === 'upsert') {
        posicao[id] = saida.length;
        saida.push(Object.assign({}, item.registro, marca));
      }
    });
    return saida;
  },
  _lerColecao: async function (nome, padrao) {
    if (typeof Offline === 'undefined' || !Offline.obterColecao) return padrao;
    try {
      var valor = await Offline.obterColecao(nome, null);
      if (valor == null || (Array.isArray(valor) && !valor.length && !Array.isArray(padrao))) return padrao;
      return valor;
    } catch (e) {
      return padrao;
    }
  },
  _salvarColecao: function (nome, valor) {
    if (typeof Offline === 'undefined' || !Offline.salvarColecao) return;
    Offline.salvarColecao(nome, valor).catch(function (e) {
      console.warn('CarWay - cache local não salvo (' + nome + '):', e);
    });
  },
  renderPagina: function () {
    var el = document.getElementById('listaDocumentos');

    var ordem = { vencido: 0, atencao: 1, ok: 2 };
    var ordenado = Documentos.lista.slice().sort(function (a, b) {
      return ordem[a._status] - ordem[b._status] || (a._dias === null ? 9999 : a._dias) - (b._dias === null ? 9999 : b._dias);
    });

    var vencidos = ordenado.filter(function (x) { return x._status === 'vencido'; }).length;
    var atencao = ordenado.filter(function (x) { return x._status === 'atencao'; }).length;
    var ok = ordenado.filter(function (x) { return x._status === 'ok'; }).length;

    var html =
      '<div class="acoes-topo">' +
        '<button class="btn-novo" onclick="App.irParaFormDocumento()">' +
          '<span class="ms">add</span> Novo documento' +
        '</button>' +
      '</div>';

    if (ordenado.length > 0) {
      html +=
        '<div class="kpis-abast" style="margin-bottom:18px">' +
          '<div class="kpi-abast" style="--cor: #ef4444">' +
            '<span class="ms" style="background:rgba(239,68,68,.15);color:#ef4444">error</span>' +
            '<b>' + vencidos + '</b>' +
            '<span class="lbl">Vencidos</span>' +
          '</div>' +
          '<div class="kpi-abast amarelo">' +
            '<span class="ms">schedule</span>' +
            '<b>' + atencao + '</b>' +
            '<span class="lbl">Próximos</span>' +
          '</div>' +
          '<div class="kpi-abast verde">' +
            '<span class="ms">check_circle</span>' +
            '<b>' + ok + '</b>' +
            '<span class="lbl">Em dia</span>' +
          '</div>' +
        '</div>';
    }

    if (ordenado.length === 0) {
      html +=
        '<div class="vazio-veiculo">' +
          '<span class="ms">folder_shared</span>' +
          '<b>Nenhum documento cadastrado</b>' +
          '<p>Cadastre CRLV, IPVA, seguro, vistoria e outros, com data de vencimento, para receber avisos.</p>' +
        '</div>';
    } else {
      html += ordenado.map(Documentos.cardHTML).join('');
    }

    el.innerHTML = html;
  },

  cardHTML: function (doc) {
    var veic = Documentos.veiculos.filter(function (v) { return v.id === doc.veiculoId; })[0] || { nome: 'Veículo removido' };
    var cor = doc._status === 'vencido' ? 'vermelho' : (doc._status === 'atencao' ? 'amarelo' : 'verde');
    var ico = doc._status === 'vencido' ? 'error' : (doc._status === 'atencao' ? 'schedule' : 'check_circle');
    var statusLabel = doc._status === 'vencido' ? 'Vencido' : (doc._status === 'atencao' ? 'Atenção' : 'Em dia');

    return '<div class="card-manut ' + doc._status + '">' +
      '<div class="cm-topo">' +
        '<div class="cm-icone"><span class="ms">' + ico + '</span></div>' +
        '<div class="cm-txt">' +
          '<b>' + App.esc(doc.tipo) + '</b>' +
          '<small>' + App.esc(veic.nome) + (veic.placa ? ' · ' + App.esc(veic.placa) : '') + (doc.numero ? ' · Nº ' + App.esc(doc.numero) : '') + '</small>' +
          '<div style="margin-top:6px"><span class="cm-tag"><span class="ms">' + ico + '</span>' + statusLabel + '</span>' +
            (doc._offlinePendente ? ' <span class="cm-tag" style="color:#f59e0b"><span class="ms">cloud_upload</span>Aguardando envio</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      (doc.dataVencimento
        ? '<div class="cm-nums">' +
            '<div class="cm-num"><b>' + Documentos.fmtData(doc.dataVencimento) + '</b><small>Vencimento</small></div>' +
            (doc.valor > 0 ? '<div class="cm-num"><b>' + App.moeda(doc.valor) + '</b><small>Valor</small></div>' : '') +
          '</div>'
        : '') +
      (doc._motivo ? '<div class="cm-motivo">' + App.esc(doc._motivo) + '</div>' : '') +
      '<div class="cm-acoes">' +
        '<button class="pri" onclick="App.irParaFormDocumento(\'' + doc.id + '\')">' +
          '<span class="ms">edit</span> Editar' +
        '</button>' +
      '</div>' +
      '<div class="acoes-abast">' +
        '<button class="excluir" onclick="Documentos.excluir(\'' + doc.id + '\')"><span class="ms">delete</span> Excluir</button>' +
      '</div>' +
    '</div>';
  },

  /* =========================================================
     FORMULARIO
     ========================================================= */
  abrirForm: async function (id, veiculoIdPre) {
    if (!Documentos.veiculos.length && typeof Veiculos !== 'undefined' && Array.isArray(Veiculos.lista) && Veiculos.lista.length) {
      Documentos.veiculos = Veiculos.lista.slice();
    }
    if (!Documentos.veiculos.length && navigator.onLine) {
      try {
        var rv = await sb.from('veiculos').select('id, nome, placa').eq('organizacaoId', orgAtual.id).order('nome');
        if (!rv.error) Documentos.veiculos = rv.data || [];
      } catch (e) {
        console.warn('CarWay documentos - veículos do aparelho:', e);
      }
    }
    if (!Documentos.veiculos.length) {
      var pagina = await Documentos._lerColecao('documentos-pagina', null) || {};
      Documentos.veiculos = (Array.isArray(pagina.veiculos) && pagina.veiculos.length)
        ? pagina.veiculos
        : await Documentos._lerColecao('veiculos', []);
    }
    if (Documentos.veiculos.length === 0) {
      App.abrirModal('Veículo necessário',
        '<div style="text-align:center;padding:10px 0">' +
          '<span class="ms" style="font-size:56px;color:var(--txt2);opacity:0.5">directions_car</span>' +
          '<h3 style="margin:16px 0 10px">Cadastre um veículo primeiro</h3>' +
          '<p style="color:var(--txt2);font-size:14px;line-height:1.6;margin:0 0 20px">' +
            'Para cadastrar documentos, você precisa ter pelo menos um veículo.' +
          '</p>' +
        '</div>',
        function () { App.fecharModal(); App.irParaFormVeiculo(); },
        'Cadastrar veículo'
      );
      return;
    }
    if (!id) {
      Documentos.editando = null;
      Documentos.renderForm(veiculoIdPre);
      return;
    }
    var achado = Documentos.lista.filter(function (d) { return d.id === id; })[0];
    if (achado) {
      Documentos.editando = achado;
      Documentos.renderForm(veiculoIdPre);
      return;
    }
    if (!navigator.onLine) {
      App.toast('Documento não encontrado neste aparelho', 'erro');
      App.irPara('documentos');
      return;
    }
    try {
      var r = await sb.from('documentos').select('*').eq('id', id).single();
      if (r.error || !r.data) {
        App.toast('Documento não encontrado', 'erro');
        return;
      }
      var st = App.statusDocumento(r.data.dataVencimento);
      Documentos.editando = Object.assign({}, r.data, { _status: st.status });
      Documentos.renderForm(veiculoIdPre);
    } catch (erro) {
      App.toast('Não foi possível abrir o documento', 'erro');
    }
  },
  renderForm: function (veiculoIdPre) {
    var d = Documentos.editando || {};
    var veiculos = Documentos.veiculos;
    var vSel = d.veiculoId || veiculoIdPre || veiculos[0].id;

    var veicOpts = veiculos.map(function (v) {
      return '<option value="' + v.id + '"' + (v.id === vSel ? ' selected' : '') + '>' +
        App.esc(v.nome) + (v.placa ? ' · ' + App.esc(v.placa) : '') + '</option>';
    }).join('');

    var tipoOpts = TIPOS_DOCUMENTO.map(function (t) {
      return '<option value="' + t + '"' + (d.tipo === t ? ' selected' : '') + '>' + t + '</option>';
    }).join('');

    var html =
      '<h2 class="form-titulo">' + (d.id ? 'Editar documento' : 'Novo documento') + '</h2>' +
      '<div class="campo-form"><label>Veículo</label>' +
        '<select id="docVeiculo">' + veicOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Tipo de documento</label>' +
        '<select id="docTipo">' + tipoOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Número (opcional)</label>' +
        '<input type="text" id="docNumero" placeholder="Nº do documento/apólice" value="' + App.esc(d.numero || '') + '">' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Data de emissão</label>' +
          '<input type="date" id="docEmissao" value="' + (d.dataEmissao || '') + '">' +
        '</div>' +
        '<div class="campo-form"><label>Data de vencimento</label>' +
          '<input type="date" id="docVencimento" value="' + (d.dataVencimento || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Valor (opcional)</label>' +
        '<input type="number" id="docValor" step="0.01" placeholder="0,00" value="' + (d.valor || '') + '">' +
      '</div>' +
      '<div class="campo-form"><label>Observações</label>' +
        '<textarea id="docObs" rows="2" style="width:100%;background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;color:var(--txt);font-family:inherit;font-size:14px;resize:vertical">' + App.esc(d.obs || '') + '</textarea>' +
      '</div>' +
      '<div class="form-acoes">' +
        '<button class="btn-cancelar-form" onclick="App.irPara(\'documentos\')">Cancelar</button>' +
        '<button class="btn-salvar-form" id="btnSalvarDoc" onclick="Documentos.salvar()">' +
          (d.id ? 'Salvar alterações' : 'Cadastrar documento') +
        '</button>' +
      '</div>';

    document.getElementById('formDocumentoContainer').innerHTML = html;
  },

  salvar: async function () {
    if (Documentos._salvando) return;
    var veiculoId = document.getElementById('docVeiculo').value;
    if (!veiculoId) { App.toast('Escolha o veículo', 'erro'); return; }
    var idEmEdicao = (Documentos.editando && Documentos.editando.id) ? Documentos.editando.id : null;
    var reg = {
      organizacaoId: orgAtual.id,
      usuarioId: usuarioAtual.id,
      veiculoId: veiculoId,
      tipo: document.getElementById('docTipo').value,
      numero: document.getElementById('docNumero').value.trim(),
      dataEmissao: document.getElementById('docEmissao').value || null,
      dataVencimento: document.getElementById('docVencimento').value || null,
      valor: Number(document.getElementById('docValor').value) || 0,
      obs: document.getElementById('docObs').value.trim()
    };
    var operacao;
    var filtros = {};
    if (idEmEdicao) {
      operacao = 'update';
      filtros.id = idEmEdicao;
      filtros.organizacaoId = orgAtual.id;
    } else {
      operacao = 'insert';
      reg.id = 'DOC_' + App.uid();
    }
    var btn = document.getElementById('btnSalvarDoc');
    var textoNormal = idEmEdicao ? 'Salvar alterações' : 'Cadastrar documento';
    Documentos._salvando = true;
    btn.disabled = true;
    btn.textContent = navigator.onLine ? 'Salvando...' : 'Salvando no aparelho...';
    try {
      var resultado;
      if (typeof Offline !== 'undefined' && Offline && typeof Offline.salvar === 'function') {
        resultado = await Offline.salvar({
          tabela: 'documentos',
          operacao: operacao,
          registro: reg,
          registroId: idEmEdicao || reg.id,
          filtros: filtros,
          metadados: { modulo: 'documentos', veiculoId: veiculoId, tipo: reg.tipo }
        });
      } else {
        var direta = operacao === 'update'
          ? await sb.from('documentos').update(reg).eq('id', idEmEdicao)
          : await sb.from('documentos').insert(reg);
        resultado = { pendente: false, error: direta.error || null };
      }
      if (resultado.error) {
        App.toast('Erro: ' + (resultado.error.message || resultado.error), 'erro');
        return;
      }
      if (resultado.pendente) {
        var st = App.statusDocumento(reg.dataVencimento);
        var localReg = Object.assign({}, reg, {
          id: idEmEdicao || reg.id,
          _offlinePendente: true,
          _offlineFilaId: resultado.filaId,
          _status: st.status, _dias: st.dias, _motivo: st.motivo
        });
        if (idEmEdicao) {
          Documentos.lista = Documentos.lista.map(function (d) {
            return d.id === idEmEdicao ? Object.assign({}, d, localReg) : d;
          });
        } else {
          Documentos.lista = [localReg].concat(Documentos.lista);
        }
        App.toast(idEmEdicao
          ? 'Alteração salva no aparelho e aguardando sincronização.'
          : 'Documento salvo no aparelho e aguardando sincronização.', 'ok');
      } else {
        App.toast(idEmEdicao ? 'Atualizado!' : 'Documento cadastrado!', 'ok');
      }
      Documentos.editando = null;
      App._documentosCache = null;
      App.irPara('documentos');
    } catch (erro) {
      console.error('CarWay documentos - erro ao salvar:', erro);
      App.toast(navigator.onLine
        ? 'Erro ao salvar documento.'
        : 'Não foi possível guardar o documento neste aparelho.', 'erro');
    } finally {
      Documentos._salvando = false;
      btn.disabled = false;
      btn.textContent = textoNormal;
    }
  },
  excluir: function (id) {
    var d = Documentos.lista.filter(function (x) { return x.id === id; })[0] || {};
    var tipo = d.tipo || 'este documento';
    if (Documentos._semRede('Excluir documento')) return;
    if (Documentos._pendenteBloqueado(d)) return;
    App.confirmar({
      titulo: 'Excluir documento',
      mensagem: 'O documento <b>' + App.esc(tipo) + '</b> será excluído permanentemente.',
      textoBotao: 'Excluir documento',
      tipo: 'perigo',
      icone: 'folder_shared',
      aoConfirmar: function () {
        if (Documentos._semRede('Excluir documento')) return;
        sb.from('documentos').delete().eq('id', id).then(function (r) {
          if (r.error) { App.toast('Erro: ' + r.error.message, 'erro'); return; }
          App.toast('Documento excluído', 'ok');
          Documentos.carregarLista();
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

