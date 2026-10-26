/* APP_VERSION: v1.0-cores-status-organizacao */
/* CarWay - vermelho para inativar e verde para reativar. */
'use strict';

(function () {
  var seletor = 'button.btn-admin-share[onclick^="PainelAdmin.abrirAlterarStatusOrganizacao"]';

  function aplicarCoresStatusOrganizacao() {
    document.querySelectorAll(seletor).forEach(function (botao) {
      var texto = String(botao.textContent || '').trim().toLowerCase();
      var reativar = texto.indexOf('reativar') !== -1;

      botao.style.setProperty('background', reativar ? '#16a34a' : '#dc2626', 'important');
      botao.style.setProperty('border', '1px solid ' + (reativar ? '#22c55e' : '#ef4444'), 'important');
      botao.style.setProperty('color', '#ffffff', 'important');
      botao.style.setProperty('font-weight', '700', 'important');
      botao.style.setProperty(
        'box-shadow',
        reativar ? '0 4px 14px rgba(22,163,74,.28)' : '0 4px 14px rgba(220,38,38,.28)',
        'important'
      );

      var icone = botao.querySelector('.ms');
      if (icone) icone.style.setProperty('color', '#ffffff', 'important');

      botao.onmouseenter = function () {
        botao.style.setProperty('background', reativar ? '#15803d' : '#b91c1c', 'important');
      };
      botao.onmouseleave = function () {
        botao.style.setProperty('background', reativar ? '#16a34a' : '#dc2626', 'important');
      };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicarCoresStatusOrganizacao);
  } else {
    aplicarCoresStatusOrganizacao();
  }

  new MutationObserver(aplicarCoresStatusOrganizacao).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
