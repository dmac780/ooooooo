import vm from "vm";
import { YELLOW, RESET } from "./utils.js";

/**
 * @param {string} attrs — substring after component="name"
 * @returns {string|null}
 * @description Read the value of a `props="..."` or `props='...'` attribute without truncating
 * at the first `"` inside JSON (the old `(.+?)` regex broke object literals).
 * @example
 * <div component="my-component" props="data">
 *   <p>{data.name}</p>
 * </div>
 * <div component="my-component" props='{ a: x.a }'>
 *   <p>{a}</p>
 * </div>
 */
export function parsePropsAttributeValue(attrs) {

  /** @type {RegExp} */
  const propsRE = /\s+props=(["'])/i;

  /** @type {RegExpMatchArray | null} */
  const m = attrs.match(propsRE);

  if (!m) {
    return null;
  }

  /** @type {string} - the quote character used to delimit the props value */
  const quote = m[1];

  /** @type {number} - the index of the start of the props value */
  let i = m.index + m[0].length;

  /** @type {number} */
  const start = i;

  // Find the end of the props value by iterating through the attributes string
  // until we find the closing quote
  while (i < attrs.length) {

    if (attrs[i] === quote) {
      return attrs.slice(start, i);
    }

    i++;
  }

  return null;
}


/**
 * @param {string} expr — raw value of the props attribute
 * @param {object} sandbox — the page's vm sandbox
 * @param {string} srcFile — for error reporting
 * @returns {object|null} 
 * @description Resolve a props expression against the page's vm sandbox context.
 * @example
 * props="data"       → returns the `data` variable from the sandbox
 * props="{ a: x.a }" → evaluates the object expression in sandbox context 
 * @example
 * <div component="my-component" props="data">
 *   <p>{data.name}</p>
 * </div>
 * <div component="my-component" props='{ a: x.a }'>
 *   <p>{a}</p>
 * </div>
 */
export function resolveProps(expr, sandbox, srcFile) {

  if (!expr) {
    return null;
  }

  try {
    // meta contains all sandbox variables (title, description, data, nav, etc.)
    // spread them all into the vm context so expressions like `data` or `{ label: data.label }` work
    
    /** @type {vm.Context} */
    const context = vm.createContext(Object.assign({}, sandbox));
    
    /** @type {unknown} */
    return vm.runInContext(`(${expr.trim()})`, context, { timeout: 500 });

  } catch (e) {
    console.warn(`${YELLOW}  Warning: could not resolve props="${expr}" in ${srcFile}: ${e.message}${RESET}`);
    return null;
  }
}
