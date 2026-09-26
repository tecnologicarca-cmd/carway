'use strict';

var Offline = {
  DB_NOME: 'carway_offline_v1',
  DB_VERSAO: 1,
  STORE_FILA: 'fila',
  STORE_CONTEXTO: 'contexto',
  TAG_SYNC: 'carway-sync-pendentes',
  _db: null,
  _inicializado: false,
  _sincronizando: false,
  _initPromise: null,

  /* =========================================================
     INICIALIZAÇÃO
     ========================================================= */
  init: function () {
    if (Offline._initPromise) return Offline._initPromise;

    Offline._initPromise = Offline._abrirBanco()
      .then(function () {
        Offline._inicializado = true;
        Offline._criarBanner();
        Offline._registrarEventos();
        return Offline.registrarServiceWorker();
      })
      .then(function () {
        return Offline.atualizarBanner();
      })
      .then(function () {
        if (navigator.onLine) {
          return Offline.sincronizarPendentes({ silencioso: true });
        }
      })
      .catch(function (erro) {
        console.error('CarWay Offline - falha na inicialização:', erro);
        Offline._mostrarAviso(
          'O armazenamento offline não pôde ser iniciado neste navegador.',
          'erro'
        );
        throw erro;
      });

    return Offline._initPromise;
  },

  _abrirBanco: function () {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB não está disponível.'));
        return;
      }

      var requisicao = indexedDB.open(Offline.DB_NOME, Offline.DB_VERSAO);

      requisicao.onupgradeneeded = function (evento) {
        var db = evento.target.result;

        if (!db.objectStoreNames.contains(Offline.STORE_FILA)) {
          var fila = db.createObjectStore(Offline.STORE_FILA, { keyPath: 'id' });
          fila.createIndex('status', 'status', { unique: false });
          fila.createIndex('criadoEm', 'criadoEm', { unique: false });
          fila.createIndex('registroId', 'registroId', { unique: false });
          fila.createIndex('tabela', 'tabela', { unique: false });
        }

        if (!db.objectStoreNames.contains(Offline.STORE_CONTEXTO)) {
          db.createObjectStore(Offline.STORE_CONTEXTO, { keyPath: 'chave' });
        }
      };

      requisicao.onsuccess = function (evento) {
        Offline._db = evento.target.result;

        Offline._db.onversionchange = function () {
          Offline._db.close();
          Offline._db = null;
        };

        resolve(Offline._db);
      };

      requisicao.onerror = function () {
        reject(requisicao.error || new Error('Falha ao abrir o IndexedDB.'));
      };

      requisicao.onblocked = function () {
        reject(new Error('Atualização do banco offline bloqueada por outra aba.'));
      };
    });
  },

  _garantirBanco: function () {
    if (Offline._db) return Promise.resolve(Offline._db);
    if (Offline._initPromise) {
      return Offline._initPromise.then(function () { return Offline._db; });
    }
    return Offline.init().then(function () { return Offline._db; });
  },

  _store: function (nome, modo) {
    var tx = Offline._db.transaction(nome, modo || 'readonly');
    return { tx: tx, store: tx.objectStore(nome) };
  },

  _requestPromise: function (request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        reject(request.error || new Error('Erro ao acessar o armazenamento offline.'));
      };
    });
  },

  /* =========================================================
     CONTEXTO LOCAL
     ========================================================= */
  salvarContexto: function (chave, valor) {
    return Offline._garantirBanco().then(function () {
      var item = {
        chave: String(chave),
        valor: valor,
        atualizadoEm: new Date().toISOString()
      };
      return Offline._requestPromise(
        Offline._store(Offline.STORE_CONTEXTO, 'readwrite').store.put(item)
      );
    });
  },

  obterContexto: function (chave) {
    return Offline._garantirBanco().then(function () {
      return Offline._requestPromise(
        Offline._store(Offline.STORE_CONTEXTO).store.get(String(chave))
      );
    }).then(function (item) {
      return item ? item.valor : null;
    });
  },

  removerContexto: function (chave) {
    return Offline._garantirBanco().then(function () {
      return Offline._requestPromise(
        Offline._store(Offline.STORE_CONTEXTO, 'readwrite').store.delete(String(chave))
      );
    });
  },

  /* =========================================================
     SALVAMENTO COM FALLBACK
     ========================================================= */
  salvar: async function (opcao) {
    opcao = opcao || {};

    var tabela = String(opcao.tabela || '').trim();
    var operacao = String(opcao.operacao || 'insert').toLowerCase();
    var registro = Offline._clonar(opcao.registro || {});
    var filtros = Offline._clonar(opcao.filtros || {});
    var dependencias = Array.isArray(opcao.dependencias)
      ? opcao.dependencias.slice()
      : [];

    if (!tabela) throw new Error('Tabela não informada para o Offline.salvar().');
    if (['insert', 'update', 'delete', 'upsert'].indexOf(operacao) === -1) {
      throw new Error('Operação offline inválida: ' + operacao);
    }

    var registroId = registro.id || filtros.id || opcao.registroId || null;

    var item = {
      id: opcao.filaId || ('OFF_' + Offline._uid()),
      tabela: tabela,
      operacao: operacao,
      registroId: registroId,
      registro: registro,
      filtros: filtros,
      dependencias: dependencias,
      organizacaoId:
        registro.organizacaoId ||
        (typeof orgAtual !== 'undefined' && orgAtual ? orgAtual.id : null),
      usuarioId:
        registro.usuarioId ||
        registro.usuarioCriadorId ||
        (typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null),
      status: 'PENDENTE',
      tentativas: 0,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      ultimoErro: '',
      metadados: Offline._clonar(opcao.metadados || {})
    };

    /* Com rede, tenta primeiramente o Supabase. */
    if (navigator.onLine && Offline._supabaseDisponivel()) {
      try {
        var resposta = await Offline._executarNoSupabase(item);

        if (!resposta.error) {
          return {
            offline: false,
            pendente: false,
            filaId: null,
            data: resposta.data || null,
            error: null
          };
        }

        /* Erro de negócio/RLS não deve ser escondido como falha de conexão. */
        if (!Offline._ehErroDeRede(resposta.error)) {
          return {
            offline: false,
            pendente: false,
            filaId: null,
            data: null,
            error: resposta.error
          };
        }
      } catch (erroRede) {
        if (!Offline._ehErroDeRede(erroRede)) throw erroRede;
      }
    }

    await Offline.enfileirar(item);
    await Offline._solicitarBackgroundSync();

    return {
      offline: true,
      pendente: true,
      filaId: item.id,
      data: registro,
      error: null
    };
  },

  enfileirar: function (item) {
    item = Offline._clonar(item || {});

    if (!item.id) item.id = 'OFF_' + Offline._uid();
    if (!item.status) item.status = 'PENDENTE';
    if (!item.criadoEm) item.criadoEm = new Date().toISOString();
    item.atualizadoEm = new Date().toISOString();
    item.tentativas = Number(item.tentativas) || 0;
    item.ultimoErro = item.ultimoErro || '';

    return Offline._garantirBanco()
      .then(function () {
        return Offline._requestPromise(
          Offline._store(Offline.STORE_FILA, 'readwrite').store.put(item)
        );
      })
      .then(function () {
        Offline.atualizarBanner();
        Offline._emitir('carway:offline-enfileirado', item);
        return item;
      });
  },

  /* =========================================================
     CONSULTA DA FILA
     ========================================================= */
  listarPendentes: function () {
    return Offline._garantirBanco()
      .then(function () {
        return Offline._requestPromise(
          Offline._store(Offline.STORE_FILA).store.getAll()
        );
      })
      .then(function (itens) {
        return (itens || [])
          .filter(function (item) {
            return item.status !== 'CONFIRMADO';
          })
          .sort(function (a, b) {
            return String(a.criadoEm).localeCompare(String(b.criadoEm));
          });
      });
  },

  contarPendentes: function () {
    return Offline.listarPendentes().then(function (itens) {
      return itens.length;
    });
  },

  obterItem: function (id) {
    return Offline._garantirBanco().then(function () {
      return Offline._requestPromise(
        Offline._store(Offline.STORE_FILA).store.get(String(id))
      );
    });
  },

  remover: function (id) {
    return Offline._garantirBanco()
      .then(function () {
        return Offline._requestPromise(
          Offline._store(Offline.STORE_FILA, 'readwrite').store.delete(String(id))
        );
      })
      .then(function () {
        Offline.atualizarBanner();
        Offline._emitir('carway:offline-removido', { id: id });
      });
  },

  limparConfirmados: function () {
    return Offline._garantirBanco().then(function () {
      return Offline._requestPromise(
        Offline._store(Offline.STORE_FILA).store.getAll()
      );
    }).then(async function (itens) {
      var confirmados = (itens || []).filter(function (item) {
        return item.status === 'CONFIRMADO';
      });

      for (var i = 0; i < confirmados.length; i++) {
        await Offline.remover(confirmados[i].id);
      }

      return confirmados.length;
    });
  },

  marcarFalha: async function (id, erro) {
    var item = await Offline.obterItem(id);
    if (!item) return null;

    item.status = 'FALHOU';
    item.tentativas = (Number(item.tentativas) || 0) + 1;
    item.ultimoErro = Offline._mensagemErro(erro);
    item.atualizadoEm = new Date().toISOString();

    await Offline.enfileirar(item);
    Offline._emitir('carway:offline-falhou', item);
    return item;
  },

  reprocessar: async function (id) {
    var item = await Offline.obterItem(id);
    if (!item) return false;

    item.status = 'PENDENTE';
    item.ultimoErro = '';
    item.atualizadoEm = new Date().toISOString();
    await Offline.enfileirar(item);

    if (navigator.onLine) {
      await Offline.sincronizarPendentes({ silencioso: false });
    }

    return true;
  },

  /* =========================================================
     SINCRONIZAÇÃO
     ========================================================= */
  sincronizarPendentes: async function (opcao) {
    opcao = opcao || {};

    if (Offline._sincronizando) {
      return { sincronizados: 0, falhas: 0, ignorados: 0, emAndamento: true };
    }

    if (!navigator.onLine || !Offline._supabaseDisponivel()) {
      await Offline.atualizarBanner();
      return { sincronizados: 0, falhas: 0, ignorados: 0, offline: true };
    }

    Offline._sincronizando = true;
    await Offline.atualizarBanner();

    var resultado = { sincronizados: 0, falhas: 0, ignorados: 0 };

    try {
      var itens = await Offline.listarPendentes();

      for (var i = 0; i < itens.length; i++) {
        if (!navigator.onLine) break;

        var item = itens[i];

        if (item.status === 'FALHOU' && !opcao.incluirFalhas) {
          resultado.ignorados++;
          continue;
        }

        if (!(await Offline._dependenciasConfirmadas(item))) {
          resultado.ignorados++;
          continue;
        }

        item.status = 'SINCRONIZANDO';
        item.atualizadoEm = new Date().toISOString();
        await Offline.enfileirar(item);

        try {
          var resposta = await Offline._executarNoSupabase(item);

          if (resposta.error) {
            if (Offline._ehErroDeRede(resposta.error)) {
              item.status = 'PENDENTE';
              item.ultimoErro = Offline._mensagemErro(resposta.error);
              item.atualizadoEm = new Date().toISOString();
              await Offline.enfileirar(item);
              break;
            }

            await Offline.marcarFalha(item.id, resposta.error);
            resultado.falhas++;
            continue;
          }

          item.status = 'CONFIRMADO';
          item.ultimoErro = '';
          item.atualizadoEm = new Date().toISOString();
          await Offline.enfileirar(item);
          await Offline.remover(item.id);

          resultado.sincronizados++;
          Offline._emitir('carway:offline-sincronizado', {
            item: item,
            resposta: resposta
          });
        } catch (erro) {
          if (Offline._ehErroDeRede(erro)) {
            item.status = 'PENDENTE';
            item.ultimoErro = Offline._mensagemErro(erro);
            item.atualizadoEm = new Date().toISOString();
            await Offline.enfileirar(item);
            break;
          }

          await Offline.marcarFalha(item.id, erro);
          resultado.falhas++;
        }
      }
    } finally {
      Offline._sincronizando = false;
      await Offline.atualizarBanner();
    }

    if (!opcao.silencioso) {
      if (resultado.sincronizados > 0 && resultado.falhas === 0) {
        Offline._mostrarAviso(
          resultado.sincronizados + ' lançamento(s) sincronizado(s).',
          'ok'
        );
      } else if (resultado.falhas > 0) {
        Offline._mostrarAviso(
          resultado.falhas + ' lançamento(s) precisam de revisão.',
          'erro'
        );
      }
    }

    return resultado;
  },

  _dependenciasConfirmadas: async function (item) {
    var deps = Array.isArray(item.dependencias) ? item.dependencias : [];
    if (!deps.length) return true;

    for (var i = 0; i < deps.length; i++) {
      var dependencia = await Offline.obterItem(deps[i]);
      if (dependencia && dependencia.status !== 'CONFIRMADO') return false;
    }

    return true;
  },

  _executarNoSupabase: async function (item) {
    if (!Offline._supabaseDisponivel()) {
      throw new TypeError('Failed to fetch: Supabase indisponível.');
    }

    var tabela = item.tabela;
    var operacao = item.operacao;
    var registro = Offline._clonar(item.registro || {});
    var filtros = Offline._clonar(item.filtros || {});
    var query;

    if (operacao === 'insert') {
      /* IDs definitivos tornam a repetição idempotente. */
      if (registro.id) {
        query = sb.from(tabela).upsert(registro, { onConflict: 'id' });
      } else {
        query = sb.from(tabela).insert(registro);
      }
    } else if (operacao === 'upsert') {
      query = sb.from(tabela).upsert(registro, { onConflict: 'id' });
    } else if (operacao === 'update') {
      query = sb.from(tabela).update(registro);
      query = Offline._aplicarFiltros(query, filtros, item.registroId);
    } else if (operacao === 'delete') {
      query = sb.from(tabela).delete();
      query = Offline._aplicarFiltros(query, filtros, item.registroId);
    }

    return await query;
  },

  _aplicarFiltros: function (query, filtros, registroId) {
    var chaves = Object.keys(filtros || {});

    if (!chaves.length && registroId) {
      return query.eq('id', registroId);
    }

    chaves.forEach(function (campo) {
      var regra = filtros[campo];

      if (regra && typeof regra === 'object' && regra.operador) {
        var operador = regra.operador;
        var valor = regra.valor;

        if (operador === 'neq') query = query.neq(campo, valor);
        else if (operador === 'gt') query = query.gt(campo, valor);
        else if (operador === 'gte') query = query.gte(campo, valor);
        else if (operador === 'lt') query = query.lt(campo, valor);
        else if (operador === 'lte') query = query.lte(campo, valor);
        else if (operador === 'in') query = query.in(campo, valor);
        else query = query.eq(campo, valor);
      } else {
        query = query.eq(campo, regra);
      }
    });

    return query;
  },

  /* =========================================================
     SERVICE WORKER E EVENTOS
     ========================================================= */
  registrarServiceWorker: function () {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);

    return navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function (registro) {
        console.log('CarWay Offline: Service Worker registrado.');

        navigator.serviceWorker.addEventListener('message', function (evento) {
          var mensagem = evento.data || {};
          if (mensagem.tipo === 'CARWAY_SINCRONIZAR_PENDENTES') {
            Offline.sincronizarPendentes({ silencioso: true });
          }
        });

        return registro;
      })
      .catch(function (erro) {
        console.error('CarWay Offline: erro ao registrar Service Worker:', erro);
        return null;
      });
  },

  _solicitarBackgroundSync: async function () {
    if (!('serviceWorker' in navigator)) return false;

    try {
      var registro = await navigator.serviceWorker.ready;
      if (!registro.sync || !registro.sync.register) return false;
      await registro.sync.register(Offline.TAG_SYNC);
      return true;
    } catch (erro) {
      return false;
    }
  },

  _registrarEventos: function () {
    window.addEventListener('online', function () {
      Offline.atualizarBanner();
      Offline.sincronizarPendentes({ silencioso: false });
    });

    window.addEventListener('offline', function () {
      Offline.atualizarBanner();
      Offline._mostrarAviso(
        'Sem conexão. Novos lançamentos serão guardados neste aparelho.',
        'erro'
      );
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && navigator.onLine) {
        Offline.sincronizarPendentes({ silencioso: true });
      }
    });
  },

  /* =========================================================
     BANNER E PENDÊNCIAS
     ========================================================= */
  _criarBanner: function () {
    if (document.getElementById('carwayOfflineBanner')) return;

    var estilo = document.createElement('style');
    estilo.id = 'carwayOfflineStyle';
    estilo.textContent = [
      '#carwayOfflineBanner{position:fixed;left:10px;right:10px;bottom:calc(82px + env(safe-area-inset-bottom,0px));z-index:790;display:none;align-items:center;gap:10px;background:#172033;color:#e8eefc;border:1px solid #33466f;border-radius:14px;padding:10px 12px;box-shadow:0 12px 30px rgba(0,0,0,.35);font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
      '#carwayOfflineBanner.on{display:flex}',
      '#carwayOfflineBanner.offline{border-color:#b45309;background:#3b260d}',
      '#carwayOfflineBanner.falha{border-color:#b91c1c;background:#3f1515}',
      '#carwayOfflineBanner .cw-off-dot{width:10px;height:10px;border-radius:50%;background:#22c55e;flex:none}',
      '#carwayOfflineBanner.offline .cw-off-dot{background:#f59e0b}',
      '#carwayOfflineBanner.falha .cw-off-dot{background:#ef4444}',
      '#carwayOfflineBanner .cw-off-texto{flex:1;min-width:0}',
      '#carwayOfflineBanner .cw-off-texto b{display:block;font-size:12px}',
      '#carwayOfflineBanner .cw-off-texto small{display:block;color:#b9c6df;font-weight:400;font-size:10.5px;margin-top:1px}',
      '#carwayOfflineBanner button{border:1px solid #4b638f;background:#223354;color:#fff;border-radius:9px;padding:8px 10px;font:700 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;cursor:pointer}',
      '#carwayOfflineBanner button:disabled{opacity:.55;cursor:wait}',
      '@media(max-width:420px){#carwayOfflineBanner{left:7px;right:7px;gap:7px;padding:9px}#carwayOfflineBanner button{padding:8px;font-size:10px}}'
    ].join('');
    document.head.appendChild(estilo);

    var banner = document.createElement('div');
    banner.id = 'carwayOfflineBanner';
    banner.innerHTML =
      '<span class="cw-off-dot"></span>' +
      '<div class="cw-off-texto">' +
        '<b id="carwayOfflineTitulo">CarWay Offline</b>' +
        '<small id="carwayOfflineResumo">Verificando conexão...</small>' +
      '</div>' +
      '<button type="button" id="carwayOfflineVer">Ver</button>' +
      '<button type="button" id="carwayOfflineSync">Sincronizar</button>';

    document.body.appendChild(banner);

    document.getElementById('carwayOfflineSync').addEventListener('click', function () {
      Offline.sincronizarPendentes({ silencioso: false, incluirFalhas: true });
    });

    document.getElementById('carwayOfflineVer').addEventListener('click', function () {
      Offline.mostrarPendencias();
    });
  },

  atualizarBanner: async function () {
    var banner = document.getElementById('carwayOfflineBanner');
    if (!banner) return;

    var itens = [];
    try {
      itens = await Offline.listarPendentes();
    } catch (erro) {
      itens = [];
    }

    var falhas = itens.filter(function (item) { return item.status === 'FALHOU'; }).length;
    var total = itens.length;
    var online = navigator.onLine;

    banner.classList.toggle('offline', !online);
    banner.classList.toggle('falha', falhas > 0);
    banner.classList.toggle('on', !online || total > 0 || Offline._sincronizando);

    var titulo = document.getElementById('carwayOfflineTitulo');
    var resumo = document.getElementById('carwayOfflineResumo');
    var botaoSync = document.getElementById('carwayOfflineSync');

    if (Offline._sincronizando) {
      titulo.textContent = 'Sincronizando lançamentos';
      resumo.textContent = total + ' item(ns) na fila';
    } else if (!online) {
      titulo.textContent = 'Sem conexão';
      resumo.textContent = total
        ? total + ' lançamento(s) aguardando sincronização'
        : 'Novos lançamentos serão salvos neste aparelho';
    } else if (falhas > 0) {
      titulo.textContent = 'Pendências com falha';
      resumo.textContent = falhas + ' de ' + total + ' item(ns) precisam de revisão';
    } else {
      titulo.textContent = 'Lançamentos pendentes';
      resumo.textContent = total + ' item(ns) aguardando envio';
    }

    botaoSync.disabled = !online || Offline._sincronizando || total === 0;
    botaoSync.textContent = Offline._sincronizando ? 'Enviando...' : 'Sincronizar';
  },

  mostrarPendencias: async function () {
    var itens = await Offline.listarPendentes();

    if (!itens.length) {
      Offline._mostrarAviso('Nenhum lançamento offline pendente.', 'ok');
      return;
    }

    var linhas = itens.map(function (item) {
      var cor = item.status === 'FALHOU' ? '#ef4444' : '#f59e0b';
      var nome = Offline._rotuloTabela(item.tabela);
      var erro = item.ultimoErro
        ? '<small style="display:block;color:#fca5a5;margin-top:4px">' + Offline._esc(item.ultimoErro) + '</small>'
        : '';

      return '<div style="border:1px solid var(--linha,#26365c);border-left:4px solid ' + cor + ';border-radius:11px;padding:11px;margin-bottom:8px;background:var(--bg2,#111c33)">' +
        '<div style="display:flex;justify-content:space-between;gap:10px">' +
          '<b>' + Offline._esc(nome) + '</b>' +
          '<span style="font-size:10px;color:' + cor + ';font-weight:800">' + Offline._esc(item.status) + '</span>' +
        '</div>' +
        '<small style="display:block;color:var(--txt2,#93a4c8);margin-top:3px">' +
          Offline._esc(item.operacao.toUpperCase()) + ' · ' + Offline._esc(item.registroId || item.id) +
        '</small>' +
        erro +
      '</div>';
    }).join('');

    if (typeof App !== 'undefined' && App.abrirModal) {
      App.abrirModal(
        'Lançamentos offline',
        '<div style="max-height:55vh;overflow:auto">' + linhas + '</div>',
        function () {
          Offline.sincronizarPendentes({ silencioso: false, incluirFalhas: true });
          if (App.fecharModal) App.fecharModal();
        },
        'Sincronizar agora'
      );
      return;
    }

    alert(itens.length + ' lançamento(s) offline pendente(s).');
  },

  /* =========================================================
     UTILITÁRIOS
     ========================================================= */
  _supabaseDisponivel: function () {
    return typeof sb !== 'undefined' && sb && typeof sb.from === 'function';
  },

  _ehErroDeRede: function (erro) {
    if (!navigator.onLine) return true;
    if (!erro) return false;

    var msg = Offline._mensagemErro(erro).toLowerCase();
    return (
      erro instanceof TypeError ||
      msg.indexOf('failed to fetch') !== -1 ||
      msg.indexOf('fetch failed') !== -1 ||
      msg.indexOf('networkerror') !== -1 ||
      msg.indexOf('network request failed') !== -1 ||
      msg.indexOf('load failed') !== -1 ||
      msg.indexOf('timeout') !== -1 ||
      msg.indexOf('connection') !== -1
    );
  },

  _mensagemErro: function (erro) {
    if (!erro) return 'Erro desconhecido';
    if (typeof erro === 'string') return erro;
    return erro.message || erro.details || erro.hint || JSON.stringify(erro);
  },

  _uid: function () {
    if (typeof App !== 'undefined' && App.uid) return App.uid();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  },

  _clonar: function (valor) {
    if (valor === undefined) return undefined;
    return JSON.parse(JSON.stringify(valor));
  },

  _emitir: function (nome, detalhe) {
    try {
      window.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
    } catch (erro) {
      console.warn('CarWay Offline - evento não emitido:', nome, erro);
    }
  },

  _mostrarAviso: function (mensagem, tipo) {
    if (typeof App !== 'undefined' && App.toast) {
      App.toast(mensagem, tipo || 'ok');
    } else {
      console.log('CarWay Offline:', mensagem);
    }
  },

  _rotuloTabela: function (tabela) {
    var rotulos = {
      abastecimentos: 'Abastecimento / recarga',
      despesas: 'Despesa',
      manutencoes: 'Manutenção',
      paradas_viagem: 'Parada da viagem',
      viagens: 'Viagem'
    };
    return rotulos[tabela] || tabela;
  },

  _esc: function (valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

/* Inicializa sem exigir alteração imediata no app.js. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    Offline.init();
  }, { once: true });
} else {
  Offline.init();
}
