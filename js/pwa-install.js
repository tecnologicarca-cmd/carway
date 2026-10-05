/* =====================================================================
   CARWAY - INSTALACAO PWA + PERMISSAO DE NOTIFICACOES
   Versao: 1.0

   Uso no index.html, antes de </body>:
   <script src="pwa-install.js"></script>
   ===================================================================== */
(function () {
  'use strict';

  var CarWayPWA = {
    deferredPrompt: null,
    modal: null,
    instalacaoDisponivel: false,
    instalado: false,
    chaveDispensa: 'carway_pwa_convite_dispensado_em',
    diasParaReexibir: 7,

    iniciar: function () {
      CarWayPWA.instalado = CarWayPWA.estaInstalado();
      CarWayPWA.injetarEstilos();
      CarWayPWA.criarModal();
      CarWayPWA.registrarEventos();

      if (CarWayPWA.instalado) {
        CarWayPWA.avaliarNotificacoes();
      }
    },

    registrarEventos: function () {
      window.addEventListener('beforeinstallprompt', function (evento) {
        evento.preventDefault();
        CarWayPWA.deferredPrompt = evento;
        CarWayPWA.instalacaoDisponivel = true;
        CarWayPWA.exibirSeNecessario();
      });

      window.addEventListener('appinstalled', function () {
        CarWayPWA.instalado = true;
        CarWayPWA.instalacaoDisponivel = false;
        CarWayPWA.deferredPrompt = null;
        CarWayPWA.renderizarEtapaNotificacao('O CarWay foi instalado com sucesso.');
        CarWayPWA.abrir();
      });

      var mm = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
      if (mm && mm.addEventListener) {
        mm.addEventListener('change', function (e) {
          if (e.matches) {
            CarWayPWA.instalado = true;
            CarWayPWA.avaliarNotificacoes(true);
          }
        });
      }
    },

    estaInstalado: function () {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true;
    },

    notificacoesSuportadas: function () {
      return 'Notification' in window;
    },

    notificacaoPendente: function () {
      return CarWayPWA.notificacoesSuportadas() && Notification.permission === 'default';
    },

    foiDispensadoRecentemente: function () {
      var valor = Number(localStorage.getItem(CarWayPWA.chaveDispensa) || 0);
      if (!valor) return false;
      var limite = CarWayPWA.diasParaReexibir * 24 * 60 * 60 * 1000;
      return Date.now() - valor < limite;
    },

    exibirSeNecessario: function () {
      if (CarWayPWA.foiDispensadoRecentemente()) return;
      if (CarWayPWA.instalacaoDisponivel && !CarWayPWA.instalado) {
        CarWayPWA.renderizarEtapaInstalacao();
        CarWayPWA.abrir();
        return;
      }
      if (CarWayPWA.instalado && CarWayPWA.notificacaoPendente()) {
        CarWayPWA.renderizarEtapaNotificacao('Ative as notificações para receber alertas importantes do CarWay.');
        CarWayPWA.abrir();
      }
    },

    avaliarNotificacoes: function (forcar) {
      if (!CarWayPWA.notificacaoPendente()) return;
      if (!forcar && CarWayPWA.foiDispensadoRecentemente()) return;
      setTimeout(function () {
        CarWayPWA.renderizarEtapaNotificacao('Ative as notificações para receber alertas importantes do CarWay.');
        CarWayPWA.abrir();
      }, 900);
    },

    renderizarEtapaInstalacao: function () {
      CarWayPWA.definirConteudo({
        icone: '📲',
        titulo: 'Instale o CarWay',
        texto: 'Tenha acesso rápido pela tela inicial e use o CarWay como um aplicativo.',
        destaque: 'Depois da instalação, o CarWay solicitará sua permissão para notificações.',
        botao: 'Instalar aplicativo',
        acao: CarWayPWA.solicitarInstalacao
      });
    },

    renderizarEtapaNotificacao: function (mensagem) {
      if (!CarWayPWA.notificacoesSuportadas()) {
        CarWayPWA.definirConteudo({
          icone: '🔕',
          titulo: 'Notificações indisponíveis',
          texto: 'Este navegador não disponibiliza notificações para o CarWay.',
          destaque: '',
          botao: 'Entendi',
          acao: CarWayPWA.fechar
        });
        return;
      }

      if (Notification.permission === 'granted') {
        CarWayPWA.fechar();
        return;
      }

      if (Notification.permission === 'denied') {
        CarWayPWA.definirConteudo({
          icone: '🔕',
          titulo: 'Notificações bloqueadas',
          texto: 'A permissão foi bloqueada no navegador. Abra as configurações do site para permitir notificações.',
          destaque: '',
          botao: 'Entendi',
          acao: CarWayPWA.fechar
        });
        return;
      }

      CarWayPWA.definirConteudo({
        icone: '🔔',
        titulo: 'Ativar notificações',
        texto: mensagem,
        destaque: 'A permissão só será solicitada depois que você tocar no botão abaixo.',
        botao: 'Permitir notificações',
        acao: CarWayPWA.solicitarNotificacoes
      });
    },

    solicitarInstalacao: async function () {
      if (!CarWayPWA.deferredPrompt) {
        CarWayPWA.mostrarInstrucaoManual();
        return;
      }

      var botao = document.getElementById('cwPwaAcao');
      if (botao) {
        botao.disabled = true;
        botao.textContent = 'Abrindo instalação...';
      }

      try {
        CarWayPWA.deferredPrompt.prompt();
        var escolha = await CarWayPWA.deferredPrompt.userChoice;
        CarWayPWA.deferredPrompt = null;
        CarWayPWA.instalacaoDisponivel = false;

        if (escolha && escolha.outcome === 'accepted') {
          CarWayPWA.renderizarEtapaNotificacao('O aplicativo foi instalado. Agora permita as notificações do CarWay.');
        } else {
          CarWayPWA.fechar();
        }
      } catch (erro) {
        console.error('CarWay PWA: falha ao abrir instalação', erro);
        CarWayPWA.mostrarInstrucaoManual();
      } finally {
        if (botao) botao.disabled = false;
      }
    },

    solicitarNotificacoes: async function () {
      if (!CarWayPWA.notificacoesSuportadas()) return;
      var botao = document.getElementById('cwPwaAcao');
      if (botao) {
        botao.disabled = true;
        botao.textContent = 'Solicitando permissão...';
      }

      try {
        var resultado = await Notification.requestPermission();
        if (resultado === 'granted') {
          CarWayPWA.fechar();
          CarWayPWA.aviso('Notificações ativadas com sucesso.', 'ok');
          CarWayPWA.enviarNotificacaoTeste();
        } else if (resultado === 'denied') {
          CarWayPWA.renderizarEtapaNotificacao('As notificações foram bloqueadas.');
        } else {
          CarWayPWA.fechar();
        }
      } catch (erro) {
        console.error('CarWay PWA: falha ao pedir notificações', erro);
        CarWayPWA.aviso('Não foi possível solicitar a permissão de notificações.', 'erro');
      } finally {
        if (botao) botao.disabled = false;
      }
    },

    enviarNotificacaoTeste: function () {
      if (!CarWayPWA.notificacoesSuportadas() || Notification.permission !== 'granted') return;
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(function (registro) {
            registro.showNotification('CarWay', {
              body: 'Notificações ativadas. Você receberá os alertas do CarWay.',
              icon: 'carway-192.png',
              badge: 'carway-192.png',
              tag: 'carway-permissao-ok'
            });
          }).catch(function () {
            new Notification('CarWay', { body: 'Notificações ativadas com sucesso.' });
          });
        } else {
          new Notification('CarWay', { body: 'Notificações ativadas com sucesso.' });
        }
      } catch (erro) {
        console.warn('CarWay PWA: notificação de teste não exibida', erro);
      }
    },

    mostrarInstrucaoManual: function () {
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      CarWayPWA.definirConteudo({
        icone: '📲',
        titulo: 'Instalar o CarWay',
        texto: ios
          ? 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.'
          : 'Abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial.',
        destaque: 'Depois, abra o CarWay instalado para ativar as notificações.',
        botao: 'Entendi',
        acao: CarWayPWA.fechar
      });
      CarWayPWA.abrir();
    },

    definirConteudo: function (dados) {
      var icone = document.getElementById('cwPwaIcone');
      var titulo = document.getElementById('cwPwaTitulo');
      var texto = document.getElementById('cwPwaTexto');
      var destaque = document.getElementById('cwPwaDestaque');
      var botao = document.getElementById('cwPwaAcao');
      if (!icone || !titulo || !texto || !destaque || !botao) return;

      icone.textContent = dados.icone;
      titulo.textContent = dados.titulo;
      texto.textContent = dados.texto;
      destaque.textContent = dados.destaque || '';
      destaque.style.display = dados.destaque ? 'block' : 'none';
      botao.textContent = dados.botao;
      botao.disabled = false;
      botao.onclick = dados.acao;
    },

    criarModal: function () {
      if (document.getElementById('cwPwaOverlay')) return;
      var overlay = document.createElement('div');
      overlay.id = 'cwPwaOverlay';
      overlay.className = 'cw-pwa-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'cwPwaTitulo');
      overlay.innerHTML =
        '<div class="cw-pwa-card">' +
          '<button type="button" class="cw-pwa-fechar" aria-label="Fechar" id="cwPwaFechar">×</button>' +
          '<div class="cw-pwa-icone" id="cwPwaIcone">📲</div>' +
          '<h2 id="cwPwaTitulo">Instale o CarWay</h2>' +
          '<p id="cwPwaTexto"></p>' +
          '<div class="cw-pwa-destaque" id="cwPwaDestaque"></div>' +
          '<button type="button" class="cw-pwa-acao" id="cwPwaAcao">Instalar aplicativo</button>' +
          '<button type="button" class="cw-pwa-depois" id="cwPwaDepois">Agora não</button>' +
        '</div>';
      document.body.appendChild(overlay);
      CarWayPWA.modal = overlay;

      document.getElementById('cwPwaFechar').onclick = CarWayPWA.dispensar;
      document.getElementById('cwPwaDepois').onclick = CarWayPWA.dispensar;
    },

    abrir: function () {
      if (!CarWayPWA.modal) return;
      CarWayPWA.modal.classList.add('cw-pwa-visivel');
      document.body.classList.add('cw-pwa-aberto');
    },

    fechar: function () {
      if (!CarWayPWA.modal) return;
      CarWayPWA.modal.classList.remove('cw-pwa-visivel');
      document.body.classList.remove('cw-pwa-aberto');
    },

    dispensar: function () {
      localStorage.setItem(CarWayPWA.chaveDispensa, String(Date.now()));
      CarWayPWA.fechar();
    },

    aviso: function (mensagem, tipo) {
      if (window.App && typeof App.toast === 'function') {
        App.toast(mensagem, tipo || 'ok');
      } else {
        console.log(mensagem);
      }
    },

    injetarEstilos: function () {
      if (document.getElementById('cwPwaEstilos')) return;
      var style = document.createElement('style');
      style.id = 'cwPwaEstilos';
      style.textContent =
        '.cw-pwa-overlay{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.76);backdrop-filter:blur(6px)}' +
        '.cw-pwa-overlay.cw-pwa-visivel{display:flex}' +
        '.cw-pwa-card{position:relative;width:min(100%,430px);padding:28px;border:1px solid rgba(148,163,184,.28);border-radius:24px;background:#111c33;color:#e8eefc;box-shadow:0 28px 80px rgba(0,0,0,.48);font-family:Segoe UI,system-ui,-apple-system,Roboto,Arial,sans-serif;text-align:center}' +
        '.cw-pwa-icone{width:70px;height:70px;margin:0 auto 16px;display:grid;place-items:center;border-radius:20px;background:linear-gradient(135deg,#2563eb,#7c3aed);font-size:34px;box-shadow:0 12px 30px rgba(59,130,246,.35)}' +
        '.cw-pwa-card h2{margin:0 34px 10px;font-size:25px;line-height:1.2;color:#fff}' +
        '.cw-pwa-card p{margin:0;color:#b7c5e2;font-size:15px;line-height:1.55}' +
        '.cw-pwa-destaque{margin:18px 0;padding:12px 14px;border-radius:14px;background:rgba(59,130,246,.13);border:1px solid rgba(96,165,250,.28);color:#bfdbfe;font-size:13px;line-height:1.45}' +
        '.cw-pwa-acao,.cw-pwa-depois{width:100%;min-height:48px;border:0;border-radius:14px;font:700 15px Segoe UI,system-ui,sans-serif;cursor:pointer}' +
        '.cw-pwa-acao{margin-top:18px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;box-shadow:0 10px 25px rgba(59,130,246,.28)}' +
        '.cw-pwa-acao:disabled{opacity:.65;cursor:wait}' +
        '.cw-pwa-depois{margin-top:8px;background:transparent;color:#93a4c8}' +
        '.cw-pwa-fechar{position:absolute;top:13px;right:14px;width:38px;height:38px;border:0;border-radius:12px;background:rgba(148,163,184,.1);color:#cbd5e1;font-size:26px;line-height:1;cursor:pointer}' +
        'body.cw-pwa-aberto{overflow:hidden}' +
        '@media(max-width:520px){.cw-pwa-overlay{align-items:flex-end;padding:12px}.cw-pwa-card{border-radius:24px 24px 18px 18px;padding:24px 20px calc(20px + env(safe-area-inset-bottom,0px))}.cw-pwa-card h2{font-size:23px}}' +
        '@media(prefers-color-scheme:light){.cw-pwa-card{background:#fff;color:#172033}.cw-pwa-card h2{color:#111827}.cw-pwa-card p{color:#52617a}.cw-pwa-depois{color:#64748b}}';
      document.head.appendChild(style);
    }
  };

  window.CarWayPWA = CarWayPWA;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', CarWayPWA.iniciar);
  } else {
    CarWayPWA.iniciar();
  }
})();
