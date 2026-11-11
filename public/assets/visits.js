/* Balise de visite (≈ 0,5 Ko) : envoie le chemin et la provenance, puis affiche le compteur dans <span id="visitor-count">.
   Ne bloque jamais l'affichage de la page (requête après le chargement, échec silencieux). */
(function () {
  var el = document.getElementById('visitor-count');
  function show(n) { if (el && typeof n === 'number') el.textContent = n.toLocaleString(document.documentElement.lang || undefined); }
  function send() {
    fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ path: location.pathname, ref: document.referrer || '' }) })
      .then(function (r) { return r.json(); }).then(function (d) { show(d.visitors); }).catch(function () {});
  }
  // Pas de comptage pour un navigateur piloté par un programme ; une page préchargée ou en arrière-plan n'est comptée qu'une fois visible.
  if (navigator.webdriver === true) return;
  function whenVisible() {
    if (document.prerendering) { document.addEventListener('prerenderingchange', whenVisible, { once: true }); return; }
    if (document.visibilityState !== 'visible') {
      var go = function () { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', go); send(); } };
      document.addEventListener('visibilitychange', go); return;
    }
    send();
  }
  if (document.readyState === 'complete') whenVisible(); else addEventListener('load', whenVisible);
})();
