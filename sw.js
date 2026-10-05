/* =====================================================================
   CARWAY - SERVICE WORKER
   Shell offline da versão Supabase / Play Store
   Release 18.2.6 - PWA, abastecimentos, manutenções e documentos offline
   ===================================================================== */

'use strict';

const CACHE_VERSION = 'carway-shell-18.2.6';
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
  './',
  './index.html',
  './manifest.json?v=18.2.0',
  './css/estilo.css?v=18.2.0',
  './fonts/material-symbols-rounded.woff2',
  './icones/carway-32.png',
  './icones/carway-180.png',
  './icones/carway-192.png',
  './icones/carway-512.png',
  './js/carway-startup.js?v=1.0',
  './js/config.js?v=2',
  './js/app.js?v=25.0',
  './js/offline.js?v=1.2',
  './js/veiculos.js?v=2.8',
  './js/abastecimentos.js?v=3.9',
  './js/manutencoes.js?v=3.1',
  './js/despesas.js?v=3.8',
  './js/documentos.js?v=1.1',
  './js/equipe.js?v=1.1',
  './js/conta.js?v=1.1',
  './js/paineladmin.js?v=3.1',
  './js/viagens.js?v=10.17',
  './pwa-install.js?v=1.1'
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
