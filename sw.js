/* =====================================================================
   CARWAY - SERVICE WORKER v1.0
   Shell offline da versão Supabase / Play Store
   ===================================================================== */

'use strict';

const CACHE_VERSION = 'carway-shell-v1.0.0';
const OFFLINE_PAGE = './index.html';

/*
 * Recursos locais essenciais.
 * O carregamento é tolerante: se um arquivo opcional ainda não existir,
 * a instalação do Service Worker não é cancelada.
 */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',

  './css/estilo.css?v=17.6',
  './css/carway-ui.css?v=1.2',

  './fonts/material-symbols-rounded.woff2',

  './icones/carway-32.png',
  './icones/carway-180.png',
  './icones/carway-192.png',
  './icones/carway-512.png',

  './js/carway-startup.js?v=1.0',
  './js/config.js?v=2',
  './js/app.js?v=24.8',
  './js/veiculos.js?v=2.6',
  './js/abastecimentos.js?v=3.5',
  './js/manutencoes.js?v=2.7',
  './js/despesas.js?v=3.2',
  './js/documentos.js?v=1.0',
  './js/equipe.js?v=1.0',
  './js/conta.js?v=1.1',
  './js/paineladmin.js?v=3.0',
  './js/viagens.js?v=10.7'
];

/* Arquivos que podem ser acrescentados nas próximas etapas. */
const OPTIONAL_SHELL = [
  './js/offline.js?v=1.0'
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isStaticAsset(request, url) {
  if (!isSameOrigin(url)) return false;

  return (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    /\.(?:css|js|woff2?|ttf|png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)
  );
}

async function putIfValid(cache, request, response) {
  if (!response || !response.ok) return response;

  try {
    await cache.put(request, response.clone());
  } catch (error) {
    console.warn('CarWay SW: não foi possível atualizar o cache:', error);
  }

  return response;
}

async function cacheShellTolerante() {
  const cache = await caches.open(CACHE_VERSION);
  const recursos = APP_SHELL.concat(OPTIONAL_SHELL);

  await Promise.allSettled(
    recursos.map(async function (recurso) {
      try {
        const request = new Request(recurso, { cache: 'reload' });
        const response = await fetch(request);

        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' em ' + recurso);
        }

        await cache.put(request, response);
      } catch (error) {
        console.warn('CarWay SW: recurso não armazenado:', recurso, error.message);
      }
    })
  );
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    cacheShellTolerante().then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (nomes) {
        return Promise.all(
          nomes.map(function (nome) {
            if (nome.startsWith('carway-shell-') && nome !== CACHE_VERSION) {
              return caches.delete(nome);
            }
            return Promise.resolve(false);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;

  /* Nunca interceptar gravações, autenticação ou chamadas de API. */
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /*
   * Navegação: tenta a rede primeiro para receber a versão mais nova.
   * Sem conexão: abre o index.html armazenado.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async function (response) {
          const cache = await caches.open(CACHE_VERSION);
          await putIfValid(cache, OFFLINE_PAGE, response);
          return response;
        })
        .catch(async function () {
          return (
            (await caches.match(request)) ||
            (await caches.match(OFFLINE_PAGE)) ||
            (await caches.match('./'))
          );
        })
    );
    return;
  }

  /*
   * Recursos estáticos locais: usa cache imediatamente e atualiza ao fundo.
   * Se ainda não estiver no cache, busca na rede e armazena.
   */
  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.match(request).then(function (cachedResponse) {
        const networkResponse = fetch(request)
          .then(async function (response) {
            const cache = await caches.open(CACHE_VERSION);
            return putIfValid(cache, request, response);
          })
          .catch(function () {
            return cachedResponse;
          });

        return cachedResponse || networkResponse;
      })
    );
    return;
  }

  /*
   * Supabase, mapas, FIPE e demais serviços externos continuam na rede.
   * Dados privados não são armazenados indiscriminadamente no Cache Storage.
   */
});

/*
 * Background Sync é complemento, não dependência.
 * O processamento real da fila ficará no js/offline.js, com a sessão Supabase.
 */
self.addEventListener('sync', function (event) {
  if (event.tag !== 'carway-sync-pendentes') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientes) {
        clientes.forEach(function (cliente) {
          cliente.postMessage({ tipo: 'CARWAY_SINCRONIZAR_PENDENTES' });
        });
      })
  );
});

self.addEventListener('message', function (event) {
  const mensagem = event.data || {};

  if (mensagem.tipo === 'CARWAY_SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (mensagem.tipo === 'CARWAY_LIMPAR_CACHE') {
    event.waitUntil(
      caches.keys().then(function (nomes) {
        return Promise.all(
          nomes
            .filter(function (nome) {
              return nome.startsWith('carway-shell-');
            })
            .map(function (nome) {
              return caches.delete(nome);
            })
        );
      })
    );
  }
});
