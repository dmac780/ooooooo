/**
 * @param {string} code
 * @param {string} hydrate
 * @param {string} selector
 * @param {number | null | undefined} visiblePercent
 * @param {number | null | undefined} timeMs
 * @param {string} componentName — stem of the component file (e.g. "mood"), used for __markHydrated
 * @param {string | null | undefined} subscribeDep — for hydrate="subscribe:name": the dep component stem
 * @param {string | null | undefined} subscribeSelector — the scoped selector of the dep component
 * @param {string | null | undefined} interactSelector — for hydrate="interact:sel": CSS selector within root to watch; null = root itself
 * @param {string | null | undefined} interactEvent — logical event name: "click" | "pointerdown" | "pointerup" | "keydown" | "touchstart" | "hover"; default "pointerdown"
 * @param {boolean | undefined} interactGlobal — if true, selector is resolved with document.querySelectorAll (targets outside this component root)
 * @returns {string}
 */
export function wrapScript(
  code,
  hydrate,
  selector,
  visiblePercent, 
  timeMs, 
  componentName, 
  subscribeDep, 
  subscribeSelector, 
  interactSelector, 
  interactEvent, 
  interactGlobal
) {  

  /** @type {string} */
  const propsInjection = `
    var props = {};
    try {
      props = JSON.parse(root.dataset.props || '{}');
    } catch(e) {
      console.warn('Failed to parse props for component', e);
    }
  `;

  const wireCall = `
    if (typeof wireReactiveDom === "function") wireReactiveDom(root);
  `;

  // __markHydrated is emitted once per instance, inside the per-element forEach
  const markCall = componentName
    ? `if(typeof __markHydrated==="function")__markHydrated(${JSON.stringify(componentName)},${JSON.stringify(selector)});`
    : "";

  // forEach runs user code + wireReactiveDom + marks hydration complete for this instance
  const forEach = `document.querySelectorAll('${selector}').forEach(function(_el){ 
    (function(root){ 
      ${propsInjection}
      ${code}
      ${wireCall}
      ${markCall}
    })(_el); 
  })`;

  switch (hydrate) {
    case "now":
      return `(function(){ ${forEach}; })();`;

    case "visible": {
      let ioOpts;
      if (visiblePercent != null && Number.isFinite(visiblePercent)) {
        const p = Math.min(100, Math.max(1, Math.round(visiblePercent)));
        ioOpts = `{ rootMargin: (function(){
  var h = window.innerHeight || document.documentElement.clientHeight || 1;
  var pct = ${p};
  var centerPx = Math.round((pct / 100) * h);
  var bandPx = Math.max(2, Math.round(0.02 * h));
  var half = Math.floor(bandPx / 2);
  var topPx = Math.max(0, centerPx - half);
  var bottomMargin = Math.max(0, h - topPx - bandPx);
  return "-" + topPx + "px 0px -" + bottomMargin + "px 0px";
})(), threshold: 0 }`;
      } else {
        ioOpts = "{ threshold: 0.1 }";
      }
      return `(function(){
  var _i = function(){
    document.querySelectorAll('${selector}').forEach(function(_el){
      var _obs = new IntersectionObserver(function(entries, obs){
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        (function(root){ 
          ${propsInjection}
          ${code}
          ${wireCall}
          ${markCall}
        })(_el);
      }, ${ioOpts});
      _obs.observe(_el);
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _i);
  } else { _i(); }
})();`;
    }

    case "time": {
      const delay = timeMs != null && Number.isFinite(timeMs) && timeMs >= 0 ? timeMs : 0;
      return `(function(){
  var _i = function(){
    setTimeout(function(){
      ${forEach};
    }, ${delay});
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _i);
  } else { _i(); }
})();`;
    }

    case "subscribe": {
      const depName = subscribeDep || "";
      const depSel = subscribeSelector || "";
      return `(function(){
  var _run = function(){
    if(typeof __whenHydrated==="function"){
      __whenHydrated(${JSON.stringify(depName)},${JSON.stringify(depSel)},function(){
        ${forEach};
      });
    } else {
      ${forEach};
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _run);
  } else { _run(); }
})();`;
    }

    case "wait":
      return `(function(){
  var _i = function(){
    document.querySelectorAll('${selector}').forEach(function(_el){
      var _run = function(){ 
        (function(root){ 
          ${propsInjection}
          ${code}
          ${wireCall}
          ${markCall}
        })(_el); 
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(_run);
      } else { setTimeout(_run, 0); }
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _i);
  } else { _i(); }
})();`;

    case "interact": {
      // "hover" maps to pointerenter (once, device-agnostic)
      const EVT_MAP = { 
          hover: "pointerenter", click: "click", pointerdown: "pointerdown", pointerup: "pointerup", keydown: "keydown", touchstart: "touchstart" };
      const domEvent = EVT_MAP[interactEvent || ""] || "pointerdown";
      const iSel = interactSelector || null;
      const useDoc = !!interactGlobal;
      const queryTargets = iSel
        ? useDoc
          ? `document.querySelectorAll(${JSON.stringify(iSel)})`
          : `_el.querySelectorAll(${JSON.stringify(iSel)})`
        : null;
      // If a sub-selector is given, attach to each matched child and fire when any one is hit.
      // If no sub-selector, attach to the component root itself.
      // interact:global: — selector is resolved on document (e.g. another component's region).
      return `(function(){
  var _i = function(){
    document.querySelectorAll('${selector}').forEach(function(_el){
      var _fired = false;
      var _run = function(){
        if(_fired) return;
        _fired = true;
        ${iSel ? `var _targets = ${queryTargets};
        _targets.forEach(function(t){ t.removeEventListener(${JSON.stringify(domEvent)}, _handler); });` : `_el.removeEventListener(${JSON.stringify(domEvent)}, _handler);`}
        (function(root){
          ${propsInjection}
          ${code}
          ${wireCall}
          ${markCall}
        })(_el);
      };
      var _handler = function(){ _run(); };
      ${iSel
        ? `var _targets = ${queryTargets};
      _targets.forEach(function(t){ t.addEventListener(${JSON.stringify(domEvent)}, _handler); });`
        : `_el.addEventListener(${JSON.stringify(domEvent)}, _handler);`}
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _i);
  } else { _i(); }
})();`;
    }

    default: // load
      return `(function(){
  var _i = function(){ ${forEach}; };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _i);
  } else { _i(); }
})();`;
  }
}
