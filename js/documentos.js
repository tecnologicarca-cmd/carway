/* APP_VERSION: v1.0 */

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

  /* =========================================================
     CARREGAR LISTA
     ========================================================= */
  carregarLista: function () {
    var el = document.getElementById('listaDocumentos');
    if (!el) return;
    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';

    Promise.all([
      sb.from('veiculos').select('id, nome, placa').eq('organizacaoId', orgAtual.id).order('nome'),
      sb.from('documentos').select('*').eq('organizacaoId', orgAtual.id)
    ]).then(function (r) {
      if (r[0].error || r[1].error) {
        el.innerHTML = '<div class="vazio-veiculo"><p>Erro ao carregar.</p></div>';
        return;
      }
      Documentos.veiculos = r[0].data || [];
      Documentos.lista = (r[1].data || []).map(function (d) {
        var st = App.statusDocumento(d.dataVencimento);
        return Object.assign({}, d, { _status: st.status, _dias: st.dias, _motivo: st.motivo });
      });

      /* Atualiza também o cache leve usado pelo hub do Painel, já que
         estamos com o dado fresco em mãos. */
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
          '<div style="margin-top:6px"><span class="cm-tag"><span class="ms">' + ico + '</span>' + statusLabel + '</span></div>' +
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
  abrirForm: function (id, veiculoIdPre) {
    var precisaCarregar = Documentos.veiculos.length === 0;
    var carregar = precisaCarregar
      ? sb.from('veiculos').select('id, nome, placa').eq('organizacaoId', orgAtual.id).order('nome').then(function (r) {
          Documentos.veiculos = r.data || [];
        })
      : Promise.resolve();

    carregar.then(function () {
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
      if (id) {
        var achado = Documentos.lista.filter(function (d) { return d.id === id; })[0];
        if (achado) {
          Documentos.editando = achado;
          Documentos.renderForm(veiculoIdPre);
          return;
        }
        sb.from('documentos').select('*').eq('id', id).single().then(function (r) {
          if (r.error || !r.data) {
            App.toast('Documento não encontrado', 'erro');
            return;
          }
          var st = App.statusDocumento(r.data.dataVencimento);
          Documentos.editando = Object.assign({}, r.data, { _status: st.status });
          Documentos.renderForm(veiculoIdPre);
        });
      } else {
        Documentos.editando = null;
        Documentos.renderForm(veiculoIdPre);
      }
    });
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

  salvar: function () {
    var veiculoId = document.getElementById('docVeiculo').value;
    if (!veiculoId) { App.toast('Escolha o veículo', 'erro'); return; }

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

    var btn = document.getElementById('btnSalvarDoc');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    var promise;
    if (Documentos.editando && Documentos.editando.id) {
      promise = sb.from('documentos').update(reg).eq('id', Documentos.editando.id);
    } else {
      reg.id = 'DOC_' + App.uid();
      promise = sb.from('documentos').insert(reg);
    }

    promise.then(function (r) {
      btn.disabled = false;
      if (r.error) {
        App.toast('Erro: ' + r.error.message, 'erro');
        btn.textContent = Documentos.editando ? 'Salvar alterações' : 'Cadastrar documento';
        return;
      }
      App.toast(Documentos.editando ? 'Atualizado!' : 'Documento cadastrado!', 'ok');
      App.irPara('documentos');
    });
  },

  excluir: function (id) {
    var d = Documentos.lista.filter(function (x) { return x.id === id; })[0] || {};
    var tipo = d.tipo || 'este documento';
    App.confirmar({
      titulo: 'Excluir documento',
      mensagem: 'O documento <b>' + App.esc(tipo) + '</b> será excluído permanentemente.',
      textoBotao: 'Excluir documento',
      tipo: 'perigo',
      icone: 'folder_shared',
      aoConfirmar: function () {
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
