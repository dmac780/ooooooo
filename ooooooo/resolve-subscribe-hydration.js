import { YELLOW, RESET } from "./utils.js";

/**
 * @param {{ hydrate: string, subscribeDep: string | null }} s — script entry from parseComponent (mutated)
 * @param {string} componentFileStem — component name (filename without `.component`)
 * @param {Record<string, string>} styleScopes — maps component stem → hash scope class (no leading dot)
 * @returns {string | null} selector like `.c1a2b3c4d` for wrapScript, or null
 * @description Validates `hydrate="subscribe:dep"` and resolves the dependency's scope selector.
 * On failure, sets `s.hydrate` to `"load"` and logs a warning.
 */
export function resolveSubscribeHydration(s, componentFileStem, styleScopes) {
  if (s.hydrate !== "subscribe") {
    return null;
  }
  if (!s.subscribeDep) {
    console.warn(
      `${YELLOW}  Warning: ${componentFileStem}.component has hydrate="subscribe" with no component name. Falling back to load.${RESET}`
    );
    s.hydrate = "load";
    return null;
  }
  if (!styleScopes[s.subscribeDep]) {
    console.warn(
      `${YELLOW}  Warning: ${componentFileStem}.component subscribe dep "${s.subscribeDep}" is not a known component. Falling back to load.${RESET}`
    );
    s.hydrate = "load";
    return null;
  }
  return `.${styleScopes[s.subscribeDep]}`;
}
