/* =====================================================================
   CARWAY - SERVICE WORKER
   Shell offline da versão Supabase / Play Store
   Release 18.2.8 - iPhone otimizado e integracao MAPS.ME
   ===================================================================== */

'use strict';

const CACHE_VERSION = 'carway-shell-18.3.14';
const OFFLINE_PAGE = './index.html';

/*
 * Recursos locais essenciais.
 *
 * O carregamento é tolerante: se um arquivo ainda não existir,
 * a instalação do Service Worker não será cancelada.
 *
 * IMPORTANTE:
 * As URLs abaixo precisam ser idênticas às carregadas pelo index.html,
 * inclusive os parâmetros de versão "?v=".
 */
const APP_SHELL = [
  './manifest.json?v=18.3.14',
  './',
  './index.html',
'./css/estilo.css?v=18.3.14',
  './js/paineladmin_status_org.js?v=18.3.14',
  './js/paineladmin_status_org_cores.js?v=18.3.14',
  './css/paineladmin_status_org_red.css?v=18.3.14',
  './fonts/material-symbols-rounded.woff2',
  './icones/carway-32.png',
  './icones/carway-180.png',
  './icones/carway-192.png',
  './icones/carway-512.png',
  './js/carway-startup.js?v=18.3.14',
  './js/config.js?v=18.3.14',
  './js/vendor/supabase-2.45.0.min.js?v=18.3.14',
  './js/vendor/jspdf-2.5.1.umd.min.js?v=18.3.14',
  './js/vendor/jspdf-autotable-3.8.2.js?v=18.3.14',
  './js/vendor/intl-tel-input/intlTelInputWithUtils-23.0.4.min.js?v=18.3.14',
  './js/vendor/leaflet/leaflet-1.9.4.js?v=18.3.14',
  './css/vendor/leaflet/leaflet-1.9.4.css?v=18.3.14',
  './css/vendor/leaflet/images/layers.png',
  './css/vendor/leaflet/images/layers-2x.png',
  './css/vendor/leaflet/images/marker-icon.png',
  './css/vendor/leaflet/images/marker-icon-2x.png',
  './css/vendor/leaflet/images/marker-shadow.png',
'./css/vendor/intlTelInput-23.0.4.css?v=18.3.14',
  './css/img/flags.png',
  './css/img/flags@2x.png',
  './css/img/globe.png',
  './css/img/globe@2x.png',
  './js/app.js?v=18.3.14',
  './js/offline.js?v=18.3.14',
  './js/veiculos.js?v=18.3.14',
  './js/abastecimentos.js?v=18.3.14',
  './js/manutencoes.js?v=18.3.14',
  './js/despesas.js?v=18.3.14',
  './js/documentos.js?v=18.3.14',
  './js/equipe.js?v=18.3.14',
  './js/conta.js?v=18.3.14',
  './js/paineladmin.js?v=18.3.14',
  './js/viagens.js?v=18.3.14',
  './js/viagens_mapsme_paradas.js?v=18.3.14',
  './js/carway-correcao-abastecimento-senha-18.2.4.js?v=18.3.14',
  './pwa-install.js?v=18.3.14'
];

/*
 * Arquivos opcionais podem ser acrescentados aqui em etapas futuras.
 * Uma falha nesses arquivos não impedirá a instalação do Service Worker.
 */
const OPTIONAL_SHELL = [];

/**
 * Verifica se a URL pertence ao mesmo domínio do CarWay.
 */
function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

/**
 * Identifica recursos estáticos locais que podem ser armazenados
 * com segurança no Cache Storage.
 */
function isStaticAsset(request, url) {
  if (!isSameOrigin(url)) {
    return false;
  }

  return (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    /\.(?:css|js|woff2?|ttf|png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)
  );
}

/**
 * Armazena uma resposta válida no cache.
 */
async function putIfValid(cache, request, response) {
  if (!response || !response.ok) {
    return response;
  }

  try {
    await cache.put(request, response.clone());
  } catch (error) {
    console.warn(
      'CarWay SW: não foi possível atualizar o cache:',
      request,
      error
    );
  }

  return response;
}

/**
 * Carrega o shell do aplicativo de forma tolerante.
 *
 * Se um recurso estiver temporariamente indisponível, os demais
 * continuarão sendo armazenados normalmente.
 */
async function cacheShellTolerante() {
  const cache = await caches.open(CACHE_VERSION);
  const recursos = APP_SHELL.concat(OPTIONAL_SHELL);

  await Promise.allSettled(
    recursos.map(async function (recurso) {
      try {
        const request = new Request(recurso, {
          cache: 'reload'
        });

        const response = await fetch(request);

        if (!response.ok) {
          throw new Error(
            'HTTP ' + response.status + ' ao carregar ' + recurso
          );
        }

        await cache.put(request, response);
      } catch (error) {
        console.warn(
          'CarWay SW: recurso não armazenado:',
          recurso,
          error.message
        );
      }
    })
  );
}

/**
 * Instalação do Service Worker.
 *
 * Armazena os recursos locais e ativa imediatamente a nova versão.
 */
self.addEventListener('install', function (event) {
  event.waitUntil(
    cacheShellTolerante().then(function () {
      return self.skipWaiting();
    })
  );
});

/**
 * Ativação do Service Worker.
 *
 * Remove versões antigas do shell e assume imediatamente
 * o controle das páginas abertas.
 */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (nomes) {
        return Promise.all(
          nomes.map(function (nome) {
            if (
              nome.startsWith('carway-shell-') &&
              nome !== CACHE_VERSION
            ) {
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

/**
 * Estratégias de carregamento.
 */
self.addEventListener('fetch', function (event) {
  const request = event.request;

  /*
   * Nunca intercepta gravações, autenticação ou chamadas que não sejam GET.
   */
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  /*
   * NAVEGAÇÃO
   *
   * Estratégia: Network First.
   *
   * 1. Tenta carregar a versão mais recente pela rede.
   * 2. Atualiza o index.html armazenado.
   * 3. Sem conexão, abre a versão offline.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async function (response) {
          const cache = await caches.open(CACHE_VERSION);

          await putIfValid(
            cache,
            OFFLINE_PAGE,
            response
          );

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
   * RECURSOS ESTÁTICOS LOCAIS
   *
   * Estratégia: Stale While Revalidate.
   *
   * 1. Entrega imediatamente o arquivo armazenado.
   * 2. Consulta a rede em segundo plano.
   * 3. Atualiza o cache para o próximo carregamento.
   */
  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.match(request).then(function (cachedResponse) {
        const networkResponse = fetch(request)
          .then(async function (response) {
            const cache = await caches.open(CACHE_VERSION);

            return putIfValid(
              cache,
              request,
              response
            );
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
   * TILES OPENSTREETMAP
   *
   * Cache passivo: armazena apenas tiles solicitados durante
   * a navegação normal do usuario. Nao faz prefetch nem download
   * de regioes.
   *
   * Online: rede primeiro e atualiza cache.
   * Offline: usa somente tile anteriormente visualizado.
   */
  if (
    request.method === 'GET' &&
    url.hostname === 'tile.openstreetmap.org' &&
    /\/\d+\/\d+\/\d+\.png$/.test(url.pathname)
  ) {
    event.respondWith(
      (async function () {
        const TILE_CACHE = 'carway-map-tiles-v1';
        const cache = await caches.open(TILE_CACHE);

        try {
          const response = await fetch(request);

          if (
            response &&
            (response.ok || response.type === 'opaque')
          ) {
            try {
              await cache.put(request, response.clone());

              /* Limite local de seguranca: somente tiles efetivamente vistos. */
              const chaves = await cache.keys();
              const LIMITE_TILES = 500;

              if (chaves.length > LIMITE_TILES) {
                const excesso = chaves.length - LIMITE_TILES;

                for (let i = 0; i < excesso; i++) {
                  await cache.delete(chaves[i]);
                }
              }
            } catch (erroCache) {
              console.warn(
                'CarWay SW: tile nao armazenado:',
                erroCache
              );
            }
          }

          return response;

        } catch (erroRede) {
          const salvo = await cache.match(request);

          if (salvo) {
            return salvo;
          }

          throw erroRede;
        }
      })()
    );

    return;
  }

  /*
   * Supabase, mapas, FIPE e demais serviços externos permanecem na rede.
   *
   * Dados privados não são armazenados indiscriminadamente no
   * Cache Storage.
   */
});

/**
 * Background Sync.
 *
 * É apenas um complemento. O processamento da fila permanece no
 * js/offline.js, porque ele possui acesso à sessão autenticada do Supabase.
 */
self.addEventListener('sync', function (event) {
  if (event.tag !== 'carway-sync-pendentes') {
    return;
  }

  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(function (clientes) {
        clientes.forEach(function (cliente) {
          cliente.postMessage({
            tipo: 'CARWAY_SINCRONIZAR_PENDENTES'
          });
        });
      })
  );
});

/**
 * Mensagens enviadas pelas páginas do CarWay ao Service Worker.
 */
self.addEventListener('message', function (event) {
  const mensagem = event.data || {};

  /*
   * Solicita ativação imediata de uma versão nova.
   */
  if (mensagem.tipo === 'CARWAY_SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  /*
   * Limpa todos os caches do shell do CarWay.
   */
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
