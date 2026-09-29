/* CarWay Startup v1.0
   - Splash inicial sem dependência externa
   - Material Symbols Rounded hospedado localmente
   - Evita que nomes como "directions_car" apareçam antes dos ícones
*/
(function () {
  'use strict';

  var raiz = document.documentElement;
  var encerrado = false;

  raiz.classList.add('cw-booting', 'cw-icons-loading');

  var estilo = document.createElement('style');
  estilo.id = 'cwStartupStyle';
  estilo.textContent = [
    '@font-face {',
    '  font-family: "CarWay Material Symbols Rounded";',
    '  font-style: normal;',
    '  font-weight: 100 700;',
    '  font-display: block;',
    '  src: url("fonts/material-symbols-rounded.woff2") format("woff2");',
    '}',
    '.ms, .material-symbols-rounded {',
    '  font-family: "CarWay Material Symbols Rounded" !important;',
    '  font-weight: normal;',
    '  font-style: normal;',
    '  font-size: 24px;',
    '  line-height: 1;',
    '  letter-spacing: normal;',
    '  text-transform: none;',
    '  display: inline-block;',
    '  white-space: nowrap;',
    '  word-wrap: normal;',
    '  direction: ltr;',
    '  -webkit-font-feature-settings: "liga";',
    '  -webkit-font-smoothing: antialiased;',
    '  font-feature-settings: "liga";',
    '  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;',
    '}',
    'html.cw-icons-loading .ms,',
    'html.cw-icons-loading .material-symbols-rounded {',
    '  visibility: hidden !important;',
    '}',
    'html.cw-booting { overflow: hidden !important; background: #0b1120 !important; }',
    'html.cw-booting::before {',
    '  content: "CarWay\\A Controle veicular inteligente";',
    '  white-space: pre;',
    '  position: fixed;',
    '  inset: 0;',
    '  z-index: 2147483646;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  box-sizing: border-box;',
    '  padding: 150px 24px 34px;',
    '  color: #e8eefc;',
    '  text-align: center;',
    '  font: 700 27px/1.9 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;',
    '  letter-spacing: -.35px;',
    '  background-color: #0b1120;',
    '  background-image: url("icones/carway-192.png"), radial-gradient(circle at 50% 38%, rgba(59,130,246,.18), transparent 34%);',
    '  background-position: center calc(50% - 72px), center;',
    '  background-size: 96px 96px, 100% 100%;',
    '  background-repeat: no-repeat;',
    '  transition: opacity .22s ease, visibility .22s ease;',
    '}',
    'html.cw-booting::after {',
    '  content: "";',
    '  position: fixed;',
    '  z-index: 2147483647;',
    '  left: 50%;',
    '  top: calc(50% + 112px);',
    '  width: 26px;',
    '  height: 26px;',
    '  margin: -13px 0 0 -13px;',
    '  border: 3px solid rgba(96,165,250,.22);',
    '  border-top-color: #60a5fa;',
    '  border-radius: 50%;',
    '  animation: cwStartupSpin .78s linear infinite;',
    '}',
    '@keyframes cwStartupSpin { to { transform: rotate(360deg); } }',
    '@media (prefers-reduced-motion: reduce) {',
    '  html.cw-booting::after { animation-duration: 1.6s; }',
    '  html.cw-booting::before { transition: none; }',
    '}'
  ].join('\n');

  (document.head || document.documentElement).appendChild(estilo);

  function removerGoogleMaterialSymbols() {
    var links = document.querySelectorAll('link[href*="fonts.googleapis.com"]');
    for (var i = 0; i < links.length; i++) {
      var href = String(links[i].href || '');
      if (href.indexOf('Material+Symbols') !== -1 || href.indexOf('Material%20Symbols') !== -1) {
        links[i].remove();
      }
    }
  }

  var observador = new MutationObserver(removerGoogleMaterialSymbols);
  observador.observe(document.documentElement, { childList: true, subtree: true });

  function finalizar() {
    if (encerrado) return;
    encerrado = true;
    observador.disconnect();
    removerGoogleMaterialSymbols();

    raiz.classList.remove('cw-icons-loading');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        raiz.classList.remove('cw-booting');
      });
    });
  }

  var paginaCarregada = new Promise(function (resolve) {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });

  var fonteCarregada = document.fonts && document.fonts.load
    ? document.fonts.load('400 24px "CarWay Material Symbols Rounded"')
        .catch(function () { return []; })
    : Promise.resolve([]);

  var tempoMinimo = new Promise(function (resolve) {
    window.setTimeout(resolve, 320);
  });

  Promise.all([paginaCarregada, fonteCarregada, tempoMinimo]).then(finalizar);

  /* Segurança: a splash nunca fica presa se um recurso externo falhar. */
  window.setTimeout(finalizar, 5000);
})();
