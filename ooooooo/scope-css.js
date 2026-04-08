/**
 * @param {string} css
 * @param {string} scope
 * @returns {string}
 * @description Scope a CSS string, used for both the bundle and critical inline.
 */
export function scopeCSS(css, scope) {
  /** @type {string} */
  let result = "";
  /** @type {number} */
  let i = 0;

  while (i < css.length) {
    // Skip whitespace between rules
    // const ruleStart = i;

    // Collect selector/at-rule up to the first {
    /** @type {string} */
    let buffer = "";
    while (i < css.length && css[i] !== "{") {
      buffer += css[i++];
    }
    if (i >= css.length) break;
    i++; // consume opening {

    const before = buffer.trim();

    // @keyframes (and @-webkit-keyframes) — copy the entire block verbatim, no scoping
    if (/^@(-\w+-)?keyframes\b/.test(before)) {
      /** @type {number} */
      let depth = 1;
      /** @type {string} */
      let inner = "";
      
      while (i < css.length && depth > 0) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") depth--;
        if (depth > 0) inner += css[i];
        i++;
      }
      result += `${before}{${inner}}\n`;
      continue;
    }

    // @media / @supports — scope inner rules but not the at-rule itself
    if (before.startsWith("@")) {
      /** @type {number} */
      let depth = 1;
      /** @type {string} */
      let inner = "";
      while (i < css.length && depth > 0) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") depth--;
        if (depth > 0) inner += css[i];
        i++;
      }
      result += `${before}{${scopeCSS(inner, scope)}}\n`;
      continue;
    }

    // Regular rule — collect declarations up to closing }
    /** @type {string} */
    let decls = "";
    /** @type {number} */
    let depth = 1;

    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      if (depth > 0) decls += css[i];
      i++;
    }

    /** @type {string} */
    const scoped = before
      .split(",")
      .map(s => `.${scope} ${s.trim()}`)
      .join(", ");
    result += `${scoped}{${decls}}\n`;
  }

  return result;
}