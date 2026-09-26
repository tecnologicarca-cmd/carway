/* APP_VERSION: v3.2 */
/* =====================================================================
   CARWAY - DESPESAS v3.2
   - Conectado ao seletor global de veiculo (App.veiculoAtivoId).
   - KPIs e lista respeitam o veiculo selecionado no topo.
   - Filtros Todos / De viagem / Dia a dia continuam combinados.
   - Novo cadastro usa o veiculo ativo como selecao inicial.
   - Veiculos e viagens sao carregados em paralelo para reduzir o atraso.
   - Mantem categorias coloridas, edicao, exclusao e confirmacoes.
   ===================================================================== */

var CATEGORIAS_DESPESA = [
  { id: 'Alimentação',    icone: 'restaurant',     classe: 'cat-alimentacao',    cor: '#22c55e' },
  { id: 'Hospedagem',     icone: 'hotel',          classe: 'cat-hospedagem',     cor: '#a78bfa' },
  { id: 'Pedágio',        icone: 'toll',           classe: 'cat-pedagio',        cor: '#f59e0b' },
  { id: 'Estacionamento', icone: 'local_parking',  classe: 'cat-estacionamento', cor: '#22d3ee' },
  { id: 'Lavagem',        icone: 'local_car_wash', classe: 'cat-lavagem',        cor: '#06b6d4' },
  { id: 'Manutenção',     icone: 'build',          classe: 'cat-manutencao',     cor: '#ec4899' },
  { id: 'Multa',          icone: 'gavel',          classe: 'cat-multa',          cor: '#ef4444' },
  { id: 'Outros',         icone: 'receipt_long',   classe: 'cat-outros',         cor: '#94a3b8' }
];

var Despesas = {
  lista: [],
  veiculos: [],
  viagens: [],
  filtro: 'todos',
  editando: null,
  categoriaSel: 'Alimentação',
  _salvando: false,
  _listenerVeiculoRegistrado: false,

  _registrarListenerVeiculoGlobal: function () {
    if (Despesas._listenerVeiculoRegistrado) return;
    if (typeof App === 'undefined' || typeof App.aoTrocarVeiculoAtivo !== 'function') return;

    Despesas._listenerVeiculoRegistrado = true;

    App.aoTrocarVeiculoAtivo(function (veiculoId) {
      var paginaLista = document.getElementById('pg-despesas');
      if (paginaLista && paginaLista.classList.contains('ativa')) {
        Despesas.renderKpis();
        Despesas.renderLista();
      }

      var paginaForm = document.getElementById('pg-despesa-form');
      if (paginaForm && paginaForm.classList.contains('ativa')) {
        var seletor = document.getElementById('dpVeiculo');
        if (seletor && veiculoId) {
          var opcao = seletor.querySelector('option[value="' + veiculoId + '"]');
          if (opcao) seletor.value = veiculoId;
        }
      }
    });
  },

  _listaDoVeiculoAtivo: function () {
    var lista = Despesas.lista || [];
    if (typeof App === 'undefined' || !App.veiculoAtivoId) return lista.slice();

    return lista.filter(function (d) {
      return d.veiculoId === App.veiculoAtivoId;
    });
  },

  carregarLista: function () {
    var el = document.getElementById('listaDespesas');
    if (!el) return;

    Despesas._registrarListenerVeiculoGlobal();
    el.innerHTML = '<div class="vazio-veiculo"><span class="ms">hourglass_top</span><p>Carregando...</p></div>';

    sb.from('despesas')
      .select('*')
      .eq('organizacaoId', orgAtual.id)
      .order('data', { ascending: false })
      .then(function (r) {
        if (r.error) {
          console.error('CarWay despesas - erro ao carregar lista:', r.error);
          el.innerHTML = '<div class="vazio-veiculo"><p>Erro ao carregar.</p></div>';
          return;
        }

        Despesas.lista = r.data || [];
        Despesas.renderKpis();
        Despesas.renderLista();
      })
      .catch(function (erro) {
        console.error('CarWay despesas - falha ao carregar lista:', erro);
        el.innerHTML = '<div class="vazio-veiculo"><p>Erro ao carregar.</p></div>';
      });
  },

  renderKpis: function () {
    var lista = Despesas._listaDoVeiculoAtivo();
    var total = 0;
    var totalViagem = 0;
    var totalRotina = 0;

    lista.forEach(function (d) {
      var valor = Number(d.valor) || 0;
      total += valor;
      if (d.viagemId) totalViagem += valor;
      else totalRotina += valor;
    });

    var el = document.getElementById('kpisDesp');
    if (!el) return;

    el.innerHTML =
      '<div class="kpi-abast">' +
        '<span class="ms" style="color:#3b82f6">payments</span>' +
        '<b>' + App.moeda(total) + '</b>' +
        '<span class="lbl">Total</span>' +
      '</div>' +
      '<div class="kpi-abast roxo">' +
        '<span class="ms" style="color:#a78bfa">luggage</span>' +
        '<b>' + App.moeda(totalViagem) + '</b>' +
        '<span class="lbl">Em viagens</span>' +
      '</div>' +
      '<div class="kpi-abast verde">' +
        '<span class="ms" style="color:#22c55e">home</span>' +
        '<b>' + App.moeda(totalRotina) + '</b>' +
        '<span class="lbl">Dia a dia</span>' +
      '</div>' +
      '<div class="kpi-abast amarelo">' +
        '<span class="ms" style="color:#f59e0b">receipt_long</span>' +
        '<b>' + lista.length + '</b>' +
        '<span class="lbl">Despesas</span>' +
      '</div>';
  },

  setFiltro: function (filtro) {
    Despesas.filtro = filtro;
    var abas = document.querySelectorAll('#pg-despesas .aba-filtro');

    for (var i = 0; i < abas.length; i++) {
      abas[i].classList.toggle('sel', abas[i].dataset.filtro === filtro);
    }

    Despesas.renderLista();
  },

  renderLista: function () {
    var el = document.getElementById('listaDespesas');
    if (!el) return;

    var lista = Despesas._listaDoVeiculoAtivo();

    if (Despesas.filtro === 'viagem') {
      lista = lista.filter(function (d) { return !!d.viagemId; });
    } else if (Despesas.filtro === 'rotina') {
      lista = lista.filter(function (d) { return !d.viagemId; });
    }

    if (lista.length === 0) {
      var filtroVeiculo = App.veiculoAtivoId ? ' para o veículo selecionado' : '';
      el.innerHTML =
        '<div class="vazio-veiculo">' +
          '<span class="ms">receipt_long</span>' +
          '<b>Nenhuma despesa</b>' +
          '<p>' + (Despesas.filtro === 'todos'
            ? 'Nenhuma despesa encontrada' + filtroVeiculo + '.'
            : 'Nenhum registro nesse filtro' + filtroVeiculo + '.') + '</p>' +
          '<button class="btn-novo" onclick="App.irParaFormDespesa()">' +
            '<span class="ms">add</span> Nova despesa' +
          '</button>' +
        '</div>';
      return;
    }

    el.innerHTML = lista.map(Despesas.cardHTML).join('');
  },

  cardHTML: function (d) {
    var cat = Despesas.getCategoria(d.categoria);
    var valor = Number(d.valor) || 0;
    var data = Despesas.fmtData(d.data);
    var detalhes = [];

    if (d.local) detalhes.push(d.local);
    if (d.viagemId) detalhes.push('Viagem');

    return '<div class="card-desp">' +
      '<div class="cd-topo">' +
        '<div class="cat-ico ' + cat.classe + '" style="background:' + cat.cor + '22;color:' + cat.cor + '">' +
          '<span class="ms" style="color:' + cat.cor + '">' + cat.icone + '</span>' +
        '</div>' +
        '<div class="cd-info">' +
          '<b>' + App.esc(d.descricao || cat.id) + '</b>' +
          '<small>' + App.esc(data) + (detalhes.length ? ' · ' + App.esc(detalhes.join(' · ')) : '') + '</small>' +
          '<span class="cd-cat-tag" style="background:' + cat.cor + '22;color:' + cat.cor + '">' +
            '<span class="ms" style="font-size:13px">' + cat.icone + '</span>' + cat.id +
          '</span>' +
        '</div>' +
        '<div class="cd-valor">' + App.moeda(valor) + '</div>' +
      '</div>' +
      '<div class="acoes-abast">' +
        '<button class="editar" onclick="App.irParaFormDespesa(\'' + d.id + '\')">' +
          '<span class="ms" style="color:#60a5fa">edit</span> Editar' +
        '</button>' +
        '<button class="excluir" onclick="Despesas.excluir(\'' + d.id + '\')">' +
          '<span class="ms" style="color:#fff">delete</span> Excluir' +
        '</button>' +
      '</div>' +
    '</div>';
  },

  abrirForm: function (id) {
    Despesas._registrarListenerVeiculoGlobal();

    var consultas = [
      sb.from('veiculos')
        .select('id, nome, placa')
        .eq('organizacaoId', orgAtual.id)
        .order('nome'),

      sb.from('viagens')
        .select('id, titulo, destino, status')
        .eq('organizacaoId', orgAtual.id)
        .neq('status', 'concluida')
        .order('dataInicio', { ascending: false })
    ];

    if (id) {
      consultas.push(
        sb.from('despesas')
          .select('*')
          .eq('id', id)
          .eq('organizacaoId', orgAtual.id)
          .single()
      );
    }

    Promise.all(consultas)
      .then(function (resultados) {
        var rVeiculos = resultados[0];
        var rViagens = resultados[1];
        var rDespesa = id ? resultados[2] : null;

        if (rVeiculos.error || !rVeiculos.data || rVeiculos.data.length === 0) {
          App.abrirModal(
            'Veículo necessário',
            '<div style="text-align:center;padding:10px 0">' +
              '<span class="ms" style="font-size:56px;color:var(--txt2);opacity:0.5">directions_car</span>' +
              '<h3 style="margin:16px 0 10px">Cadastre um veículo primeiro</h3>' +
              '<p style="color:var(--txt2);font-size:14px;line-height:1.6;margin:0 0 20px">' +
                'Para lançar despesas, você precisa cadastrar pelo menos um veículo.' +
              '</p>' +
            '</div>',
            function () {
              App.fecharModal();
              App.irParaFormVeiculo();
            },
            'Cadastrar veículo'
          );
          return;
        }

        Despesas.veiculos = rVeiculos.data || [];

        if (rViagens.error) {
          console.error('CarWay despesas - erro ao carregar viagens:', rViagens.error);
          Despesas.viagens = [];
        } else {
          Despesas.viagens = rViagens.data || [];
        }

        if (id) {
          if (!rDespesa || rDespesa.error || !rDespesa.data) {
            console.error('CarWay despesas - erro ao carregar despesa:', rDespesa && rDespesa.error);
            App.toast('Despesa não encontrada', 'erro');
            App.irPara('despesas');
            return;
          }

          Despesas.editando = rDespesa.data;
          Despesas.categoriaSel = rDespesa.data.categoria || 'Alimentação';
        } else {
          Despesas.editando = null;
          Despesas.categoriaSel = 'Alimentação';
        }

        Despesas.renderForm();
      })
      .catch(function (erro) {
        console.error('CarWay despesas - erro ao abrir formulário:', erro);
        App.toast('Não foi possível abrir o cadastro de despesa', 'erro');
        App.irPara('despesas');
      });
  },

  renderForm: function () {
    var d = Despesas.editando || {};
    var veiculos = Despesas.veiculos || [];

    if (!veiculos.length) return;

    var veiculoGlobalValido =
      App.veiculoAtivoId &&
      veiculos.some(function (v) { return v.id === App.veiculoAtivoId; });

    var vSel = d.veiculoId || (veiculoGlobalValido ? App.veiculoAtivoId : veiculos[0].id);
    var dataHoje = App.hojeISO();

    var veicOpts = veiculos.map(function (v) {
      return '<option value="' + v.id + '"' + (v.id === vSel ? ' selected' : '') + '>' +
        App.esc(v.nome) + (v.placa ? ' · ' + App.esc(v.placa) : '') +
      '</option>';
    }).join('');

    var viagOpts = '<option value="">— Nenhuma (gasto do dia a dia) —</option>' +
      Despesas.viagens.map(function (v) {
        return '<option value="' + v.id + '"' + (v.id === d.viagemId ? ' selected' : '') + '>' +
          App.esc(v.titulo || v.destino || 'Viagem') +
        '</option>';
      }).join('');

    var catsHtml = CATEGORIAS_DESPESA.map(function (c) {
      var sel = c.id === Despesas.categoriaSel;
      return '<button type="button" class="cat-opcao' + (sel ? ' sel' : '') + '" ' +
        'data-cat="' + c.id + '" onclick="Despesas.selCat(this)" ' +
        'style="' + (sel ? 'border-color:' + c.cor + ';background:' + c.cor + '1a' : '') + '">' +
        '<span class="ms" style="color:' + c.cor + '">' + c.icone + '</span>' +
        '<span>' + c.id + '</span>' +
      '</button>';
    }).join('');

    var html =
      '<h2 class="form-titulo">' + (d.id ? 'Editar despesa' : 'Nova despesa') + '</h2>' +
      '<div class="campo-form"><label>Veículo</label>' +
        '<select id="dpVeiculo">' + veicOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Categoria</label>' +
        '<div class="cats-grid" id="catsGrid">' + catsHtml + '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Descrição</label>' +
        '<input type="text" id="dpDescricao" placeholder="Ex: Almoço na estrada" value="' + App.esc(d.descricao || '') + '" maxlength="100">' +
      '</div>' +
      '<div class="linha-2">' +
        '<div class="campo-form"><label>Valor</label>' +
          '<input type="number" id="dpValor" step="0.01" min="0" placeholder="0,00" value="' + (d.valor || '') + '">' +
        '</div>' +
        '<div class="campo-form"><label>Data</label>' +
          '<input type="date" id="dpData" value="' + (d.data || dataHoje) + '">' +
        '</div>' +
      '</div>' +
      '<div class="campo-form"><label>Local</label>' +
        '<input type="text" id="dpLocal" placeholder="Cidade, restaurante, posto..." value="' + App.esc(d.local || '') + '">' +
      '</div>' +
      '<div class="campo-form"><label>Vincular a viagem (opcional)</label>' +
        '<select id="dpViagem">' + viagOpts + '</select>' +
      '</div>' +
      '<div class="campo-form"><label>Observações</label>' +
        '<textarea id="dpObs" rows="2" style="width:100%;background:var(--bg2);border:1px solid var(--linha);border-radius:11px;padding:12px;color:var(--txt);font-family:inherit;font-size:14px;resize:vertical">' +
          App.esc(d.obs || '') +
        '</textarea>' +
      '</div>' +
      '<div class="form-acoes">' +
        '<button class="btn-cancelar-form" onclick="App.irPara(\'despesas\')">' +
          '<span class="ms">arrow_back</span> Cancelar' +
        '</button>' +
        (d.id
          ? '<button class="btn-excluir excluir" onclick="Despesas.excluirDoForm(\'' + d.id + '\')">' +
              '<span class="ms">delete</span> Excluir' +
            '</button>'
          : '') +
        '<button class="btn-salvar-form" id="btnSalvarDp" onclick="Despesas.salvar()">' +
          (d.id ? 'Salvar alterações' : 'Registrar despesa') +
        '</button>' +
      '</div>';

    var container = document.getElementById('formDespesaContainer');
    if (container) container.innerHTML = html;
  },

  selCat: function (el) {
    var ops = document.querySelectorAll('#catsGrid .cat-opcao');

    for (var i = 0; i < ops.length; i++) {
      ops[i].classList.remove('sel');
      ops[i].style.borderColor = '';
      ops[i].style.background = '';
    }

    el.classList.add('sel');

    var categoria = Despesas.getCategoria(el.getAttribute('data-cat'));
    el.style.borderColor = categoria.cor;
    el.style.background = categoria.cor + '1a';
    Despesas.categoriaSel = categoria.id;
  },

  salvar: function () {
    if (Despesas._salvando) return;

    var veiculoId = document.getElementById('dpVeiculo').value;
    var valor = Number(document.getElementById('dpValor').value) || 0;
    var data = document.getElementById('dpData').value;

    if (!veiculoId) {
      App.toast('Escolha o veículo', 'erro');
      return;
    }

    if (valor <= 0) {
      App.toast('Informe o valor', 'erro');
      return;
    }

    if (!data) {
      App.toast('Informe a data', 'erro');
      return;
    }

    Despesas._salvando = true;

    var viagemId = document.getElementById('dpViagem').value;
    viagemId = viagemId && viagemId.trim() ? viagemId : null;

    var reg = {
      organizacaoId: orgAtual.id,
      usuarioId: usuarioAtual.id,
      veiculoId: veiculoId,
      viagemId: viagemId,
      data: data,
      categoria: Despesas.categoriaSel,
      descricao: document.getElementById('dpDescricao').value.trim(),
      valor: valor,
      local: document.getElementById('dpLocal').value.trim(),
      obs: document.getElementById('dpObs').value.trim()
    };

    var btn = document.getElementById('btnSalvarDp');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Salvando...';
    }

    var promise;

    if (Despesas.editando && Despesas.editando.id) {
      promise = sb.from('despesas')
        .update(reg)
        .eq('id', Despesas.editando.id)
        .eq('organizacaoId', orgAtual.id);
    } else {
      reg.id = 'DES_' + App.uid();
      promise = sb.from('despesas').insert(reg);
    }

    promise
      .then(function (r) {
        Despesas._salvando = false;
        if (btn) btn.disabled = false;

        if (r.error) {
          App.toast('Erro: ' + r.error.message, 'erro');
          if (btn) btn.textContent = Despesas.editando ? 'Salvar alterações' : 'Registrar despesa';
          return;
        }

        if (App._painelRaw) App._painelRaw = null;
        App.toast(Despesas.editando ? 'Atualizado!' : 'Despesa registrada!', 'ok');
        App.irPara('despesas');
      })
      .catch(function (erro) {
        Despesas._salvando = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = Despesas.editando ? 'Salvar alterações' : 'Registrar despesa';
        }
        console.error('CarWay despesas - erro ao salvar:', erro);
        App.toast('Erro: ' + (erro.message || 'desconhecido'), 'erro');
      });
  },

  excluir: function (id) {
    var d = Despesas.lista.filter(function (x) { return x.id === id; })[0] || {};
    Despesas._confirmarExclusao(id, d, false);
  },

  excluirDoForm: function (id) {
    Despesas._confirmarExclusao(id, Despesas.editando || {}, true);
  },

  _confirmarExclusao: function (id, d, voltarParaLista) {
    var cat = Despesas.getCategoria(d.categoria);
    var desc = d.descricao || cat.id;

    App.confirmar({
      titulo: 'Excluir despesa',
      mensagem: 'A despesa <b>' + App.esc(desc) + '</b> de <b>' + App.moeda(d.valor) + '</b> será excluída permanentemente.',
      textoBotao: 'Excluir despesa',
      tipo: 'perigo',
      icone: 'receipt_long',
      aoConfirmar: function () {
        sb.from('despesas')
          .delete()
          .eq('id', id)
          .eq('organizacaoId', orgAtual.id)
          .then(function (r) {
            if (r.error) {
              App.toast('Erro: ' + r.error.message, 'erro');
              return;
            }

            if (App._painelRaw) App._painelRaw = null;
            App.toast('Despesa excluída', 'ok');

            if (voltarParaLista) App.irPara('despesas');
            else Despesas.carregarLista();
          })
          .catch(function (erro) {
            console.error('CarWay despesas - erro ao excluir:', erro);
            App.toast('Erro ao excluir despesa', 'erro');
          });
      }
    });
  },

  getCategoria: function (id) {
    for (var i = 0; i < CATEGORIAS_DESPESA.length; i++) {
      if (CATEGORIAS_DESPESA[i].id === id) return CATEGORIAS_DESPESA[i];
    }

    return CATEGORIAS_DESPESA[CATEGORIAS_DESPESA.length - 1];
  },

  fmtData: function (s) {
    if (!s) return '—';
    var p = String(s).substring(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s;
  }
};
