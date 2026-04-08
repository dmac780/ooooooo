import fs from "fs";

/**
 * @param {string} file0
 * @returns {{ template: string, style: string, styleCritical: boolean, scripts: Array }}
 * @description Parse a component file and return the template, style, styleCritical, and scripts.
 * detect critical + hydrate (order-independent) inside of <script>
 */
export function parseComponent(file) {

  /** @type {string} */
  const src = fs.readFileSync(file, "utf8");

  /** @type {RegExp} */
  const styleRE = /<style(\s+critical)?\s*>([\s\S]*?)<\/style>/i;

  /** @type {RegExpMatchArray | null} */
  const styleMatch = src.match(styleRE);
  
  /** @type {string} */
  const style = styleMatch ? styleMatch[2].trim() : "";
  
  /** @type {boolean} */
  const styleCritical = !!(styleMatch && styleMatch[1]);

  /** @type {Array<{ hydrate: string, critical: boolean, code: string, visiblePercent: number | null, timeMs: number | null, subscribeDep: string | null, interactSelector: string | null, interactEvent: string | null, interactGlobal: boolean }>} */
  const scripts  = [];

  /** @type {RegExp} */
  const scriptRE =
    /<script(\s+critical)?(?:\s+hydrate="([^"]+)")?(?:\s+hydrate="([^"]+)")?(\s+critical)?\s*>([\s\S]*?)<\/script>/gi;

  for (const m of src.matchAll(scriptRE)) {
    /** @type {boolean} */
    const critical = !!(m[1] || m[4]);
    /** @type {string} */
    const rawHydrate = (m[2] || m[3] || "load").trim().toLowerCase();
    /** @type {string} */
    const codes = m[5].trim();

    /** @type {string} */
    let hydrate = "load";
    /** @type {number | null} */
    let visiblePercent = null;
    /** @type {number | null} */
    let timeMs = null;
    /** @type {string | null} */
    let subscribeDep = null;
    /** @type {string | null} */
    let interactSelector = null;
    /** @type {string | null} */
    let interactEvent = null;
    /** @type {boolean} */
    let interactGlobal = false;

    if (rawHydrate === "visible" || rawHydrate.startsWith("visible:")) {
      hydrate = "visible";
      if (rawHydrate.startsWith("visible:")) {
        const n = parseInt(rawHydrate.slice("visible:".length).trim(), 10);
        if (Number.isFinite(n)) {
          visiblePercent = Math.min(100, Math.max(1, n));
        }
      }
    } else if (rawHydrate === "time" || rawHydrate.startsWith("time:")) {
      hydrate = "time";
      if (rawHydrate.startsWith("time:")) {
        const ms = parseInt(rawHydrate.slice("time:".length).trim(), 10);
        if (Number.isFinite(ms) && ms >= 0) {
          timeMs = ms;
        }
      } else {
        timeMs = 0;
      }
    } else if (rawHydrate.startsWith("subscribe:")) {
      hydrate = "subscribe";
      const dep = rawHydrate.slice("subscribe:".length).trim();
      if (dep) {
        subscribeDep = dep;
      }
    } else if (rawHydrate === "interact" || rawHydrate.startsWith("interact:")) {
      hydrate = "interact";
      if (rawHydrate.startsWith("interact:")) {
        let rest = rawHydrate.slice("interact:".length);
        if (rest.startsWith("global:")) {
          interactGlobal = true;
          rest = rest.slice("global:".length);
        }
        // known event keywords (normalised)
        const EVENT_KEYWORDS = ["click", "pointerdown", "pointerup", "hover", "keydown", "touchstart"];
        const lastColon = rest.lastIndexOf(":");
        if (lastColon === -1) {
          // interact:something — is it a bare event keyword or a selector?
          if (EVENT_KEYWORDS.includes(rest)) {
            interactEvent = rest;
          } else {
            interactSelector = rest;
          }
        } else {
          const maybeSel = rest.slice(0, lastColon);
          const maybeEvt = rest.slice(lastColon + 1);
          if (EVENT_KEYWORDS.includes(maybeEvt)) {
            interactSelector = maybeSel || null;
            interactEvent = maybeEvt;
          } else {
            // colon is part of a CSS selector like :not(.x) or :first-child
            interactSelector = rest;
          }
        }
      }
    } else if (["now", "load", "wait"].includes(rawHydrate)) {
      hydrate = rawHydrate;
    }

    scripts.push({ hydrate, critical, code: codes, visiblePercent, timeMs, subscribeDep, interactSelector, interactEvent, interactGlobal });
  }
  /** @type {RegExp} */
  const styleTagRE  = /<style[\s\S]*?<\/style>/gi;

  /** @type {RegExp} */
  const scriptTagRE = /<script[\s\S]*?<\/script>/gi;

  // Strip <style> and <script> so the remainder is the template
  /**@type {string}*/
  const template = src
    .replace(styleTagRE, "")
    .replace(scriptTagRE, "")
    .trim();

  return { template, style, styleCritical, scripts };
}