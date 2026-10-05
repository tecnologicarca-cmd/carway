/* APP_VERSION: v1.0-mapsme-paradas */
/* CARWAY - MAPS.ME com escolha entre proxima parada e destino final.
   Carregar DEPOIS de viagens.js. */
'use strict';

(function () {
  if (typeof Viagens === 'undefined') {
    console.error('CarWay: viagens.js precisa ser carregado antes de viagens_mapsme_paradas.js');
    return;
  }

  var abrirAppOriginal = Viagens.abrirAppNavegacao;
  var destinoPendente = null;
  var origemPendente = null;
  var silenciosoPendente = false;

  function coordenadaValida(valor) {
    return valor !== null && valor !== undefined && valor !== '' && !isNaN(Number(valor));
  }

  function normalizarPonto(ponto, nomePadrao) {
    if (!ponto) return null;

    var lat = ponto.lat;
    var lon = ponto.lon;

    if (!coordenadaValida(lat)) lat = ponto.latitude;
    if (!coordenadaValida(lon)) lon = ponto.longitude;
    if (!coordenadaValida(lat)) lat = ponto.postoLat;
    if (!coordenadaValida(lon)) lon = ponto.postoLon;

    if (!coordenadaValida(lat) || !coordenadaValida(lon)) return null;

    return {
      lat: Number(lat),
      lon: Number(lon),
      nome: String(
        ponto.postoNome || ponto.nome || ponto.curto || ponto.endereco || nomePadrao || 'Destino CarWay'
      ).trim()
    };
  }

  function paradasDisponiveis() {
    var lista = Array.isArray(Viagens._paradasParaNavegacao)
      ? Viagens._paradasParaNavegacao
      : [];

    return lista
      .filter(function (p) {
        var status = String(p.status || '').trim().toUpperCase();
        return status !== 'IGNORADA' && status !== 'CONCLUIDA' && status !== 'CONCLUÍDA';
      })
      .sort(function (a, b) {
        return (Number(a.ordem) || 0) - (Number(b.ordem) || 0);
      })
      .map(function (p, indice) {
        return normalizarPonto(p, 'Parada ' + (indice + 1));
      })
      .filter(Boolean);
  }

  function abrirMapsMeNoPonto(ponto) {
    if (!ponto) {
      App.toast('Não foi possível localizar o ponto escolhido', 'erro');
      return;
    }

    var url = 'mapswithme://map?v=1&ll=' +
      encodeURIComponent(ponto.lat + ',' + ponto.lon) +
      '&n=' + encodeURIComponent(ponto.nome || 'Destino CarWay') +
      '&id=' + encodeURIComponent('carway-navegacao') +
      '&appname=' + encodeURIComponent('CarWay');

    if (!silenciosoPendente) {
      App.toast('Abrindo MAPS.ME: ' + (ponto.nome || 'destino'), 'ok');
    }

    window.location.href = url;
  }

  Viagens.abrirMapsMeEscolha = function (tipo) {
    var paradas = paradasDisponiveis();
    var destinoFinal = normalizarPonto(destinoPendente, 'Destino final');

    App.fecharModal();

    if (tipo === 'proxima') {
      if (!paradas.length) {
        App.toast('Não há parada pendente. Abrindo o destino final.', 'ok');
        abrirMapsMeNoPonto(destinoFinal);
        return;
      }
      abrirMapsMeNoPonto(paradas[0]);
      return;
    }

    abrirMapsMeNoPonto(destinoFinal);
  };

  Viagens.mostrarEscolhaMapsMe = function (origem, destino, silencioso) {
    origemPendente = origem;
    destinoPendente = destino;
    silenciosoPendente = silencioso === true;

    var paradas = paradasDisponiveis();
    var proxima = paradas.length ? paradas[0] : null;
    var destinoFinal = normalizarPonto(destino, 'Destino final');

    var html =
      '<div class="aviso info" style="margin-bottom:14px">' +
        '<span class="ms">travel_explore</span>' +
        '<div><b>Navegação offline com MAPS.ME</b>Escolha qual ponto deseja abrir agora.</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
        (proxima
          ? '<button type="button" class="btn-admin-share" style="width:100%;padding:13px;text-align:left" onclick="Viagens.abrirMapsMeEscolha(\'proxima\')">' +
              '<span class="ms" style="color:#f59e0b">local_gas_station</span>' +
              '<span><b style="display:block">Próxima parada</b><small style="display:block;color:var(--txt2);margin-top:2px">' + App.esc(proxima.nome) + '</small></span>' +
            '</button>'
          : '<div style="padding:11px 12px;border-radius:10px;background:var(--bg2,#111c33);color:var(--txt2);font-size:12px">' +
              '<span class="ms" style="font-size:15px">info</span> Não há parada pendente nesta viagem.' +
            '</div>') +
        '<button type="button" class="btn-admin-share" style="width:100%;padding:13px;text-align:left" onclick="Viagens.abrirMapsMeEscolha(\'destino\')">' +
          '<span class="ms" style="color:#22c55e">flag</span>' +
          '<span><b style="display:block">Destino final</b><small style="display:block;color:var(--txt2);margin-top:2px">' + App.esc(destinoFinal ? destinoFinal.nome : 'Destino da viagem') + '</small></span>' +
        '</button>' +
      '</div>' +
      '<small style="display:block;margin-top:12px;color:var(--txt2);line-height:1.5">' +
        'O CarWay mantém a sequência das paradas. O MAPS.ME recebe um ponto por vez para permitir navegação com mapas previamente baixados.' +
      '</small>';

    App.abrirModal('Abrir no MAPS.ME', html, null);
  };

  Viagens.abrirAppNavegacao = function (app, origem, destino, silencioso) {
    if (app === 'mapsme') {
      Viagens.mostrarEscolhaMapsMe(origem, destino, silencioso);
      return;
    }

    return abrirAppOriginal.call(Viagens, app, origem, destino, silencioso);
  };
})();
