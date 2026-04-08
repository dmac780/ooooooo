import { renderTemplate } from "./curly-templates.js";
import { RED, RESET } from "./utils.js";

/**
 * @param {Record<string, string>} templates — loaded `.template` files by name
 * @param {string} content — page body HTML
 * @param {Record<string, unknown>} meta — page script / frontmatter
 * @param {string} templateName — the name of the template to apply
 * @param {string} srcFile — for error messages
 * @returns {string}
 * @description Applies the template to the page body HTML and returns the resulting HTML.
 * @example
 * ```html
 * <div id="content">
 *   <h1>Hello, world!</h1>
 * </div>
 * ```
 */
export function applyTemplate(templates, content, meta, templateName, srcFile) {

  /** @type {Record<string, string>} */
  const template = templates[templateName];

  if (!template) {
    console.error(`${RED}  Error: template "${templateName}.template" not found (required by ${srcFile})${RESET}`);
    process.exit(1);
  }

  /** @type {RegExp} */
  const squareBracketRE = /\[([^\]]+)\]/g;

  /** @type {string} */
  const mount = `[${meta.mount}]`;

  /** @type {string} */
  let html = template;

  // Inject page body into the designated mount point
  // And then replace all remaining [key] tokens with the corresponding value from the meta object
  // stringify objects/arrays for embedding
  html = html.replace(mount, content);
  html = html.replace(squareBracketRE, (_, key) => {
    if (meta[key] === undefined) {
      return "";
    }

    /** @type {unknown} */
    const val = meta[key];

    return (typeof val === "object" && val !== null) ? JSON.stringify(val) : String(val);
  });

  return renderTemplate(html, meta);
}
