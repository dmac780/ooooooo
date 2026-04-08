import path from "path";
import fs from "fs";
import vm from "vm";
import { CONFIG } from "./config.js";
import { RED, RESET } from "./utils.js";

/**
 * @param {string} src — raw file content
 * @param {string} filename — used to derive default title
 * @returns {{ meta: Record<string, any>, content: string, sandbox: Record<string, any> }}
 * @description Execute the page's build-time <script> block in a vm sandbox and extract
 * all defined variables. The script block is stripped from the returned content.
 * @example
 * ```html
 * <script>
 *   const title = "My Page";
 *   const description = "This is my page";
 * </script>
 * ```
 */
export function parsePageScript(src, filename) {

  /** @type {RegExp} */
  const separatorRE = /[-_]/g;

  /** @type {RegExp} */
  const capitalizeRE = /\b\w/g;

  /** @type {string} */
  const defaultTitle = path.basename(filename, ".html")
    .replace(separatorRE, " ")
    .replace(capitalizeRE, c => c.toUpperCase());

  /** @type {string} */
  const defaultMount = "content";

  /** @type {string} */
  const defaultTemplate = "index";

  /** @type {string} */
  const defaultDescription = "";

  /** @type {Record<string, string>} */
  const defaults = {
    title: defaultTitle,
    description: defaultDescription,
    mount: defaultMount,
    template: defaultTemplate
  };

  /** @type {RegExp} */
  const scriptRE = /^\s*<script>([\s\S]*?)<\/script>\s*/i;

  /** @type {RegExpMatchArray | null} */
  const scriptMatch = src.match(scriptRE);

  if (!scriptMatch) {
    return { 
      meta: defaults, 
      content: src.trim(), 
      sandbox: { ...defaults } 
    };
  }

  /** @type {string} */
  const scriptSrc = scriptMatch[1];

  /** @type {string} */
  const content = src.slice(scriptMatch[0].length).trim();

  /** @type {Record<string, any>} */
  const sandbox = {};

  /** @type {RegExp} */
  const constRE = /^\s*const\s+/gm;

  /** @type {RegExp} */
  const letRE = /^\s*let\s+/gm;
  
  // Collect injections from __injectStyle / __injectScript calls
  /** @type {Array<{href: string, rel: string, media: string|null, integrity: string|null, crossorigin: string|null, preconnect: boolean, dnsPrefetch: boolean}>} */
  sandbox.__injectStyles = [];

  /** @type {Array<{src: string, delivery: string, integrity: string|null, crossorigin: string|null, preconnect: boolean, dnsPrefetch: boolean}>} */
  sandbox.__injectScripts = [];

  /**
   * @param {string} href
   * @param {"stylesheet"|"preload"|"media"} [rel="stylesheet"]
   * @param {{ media?: string, integrity?: string, crossorigin?: string, preconnect?: boolean, dnsPrefetch?: boolean }} [opts]
   * @example
   * ```html
   *   __injectStyle("https://example.com/style.css", "stylesheet");
   * ```
   */
  sandbox.__injectStyle = function(href, rel, opts) {
    const o = opts || {};
    sandbox.__injectStyles.push({
      href,
      rel: rel || "stylesheet",
      media: o.media || null,
      integrity: o.integrity || null,
      crossorigin: o.crossorigin || null,
      preconnect: !!o.preconnect,
      dnsPrefetch: !!o.dnsPrefetch,
    });
  };

  /**
   * @param {string} src
   * @param {"script"|"async"|"defer"|"module"|"preload"} [delivery="script"]
   * @param {{ integrity?: string, crossorigin?: string, preconnect?: boolean, dnsPrefetch?: boolean }} [opts]
   * @example
   * ```html
   *   __injectScript("https://example.com/script.js", "async");
   * ```
   */
  sandbox.__injectScript = function(src, delivery, opts) {
    const o = opts || {};
    sandbox.__injectScripts.push({
      src,
      delivery: delivery || "script",
      integrity: o.integrity || null,
      crossorigin: o.crossorigin || null,
      preconnect: !!o.preconnect,
      dnsPrefetch: !!o.dnsPrefetch,
    });
  };

  // Inject __data() helper for build-time data loading
  sandbox.__data = function(dataPath, exportName) {
    
    /** @type {string} */
    const resolved = path.resolve(CONFIG.src, dataPath);
    if (!fs.existsSync(resolved)) {
      console.error(`${RED}  Error: __data("${dataPath}") - file not found at ${resolved}${RESET}`);
      process.exit(1);
    }
    
    /** @type {string} */
    let fileContent = fs.readFileSync(resolved, "utf8");

    /** @type {RegExp} */
    const exportDefaultRE = /^\s*export\s+(default\s+)?/gm;

    /** @type {RegExp} */
    const moduleExportsRE = /^\s*module\.exports\s*=\s*/gm;
    
    // Strip any export statements (ES module syntax not supported in VM)
    fileContent = fileContent
      .replace(exportDefaultRE, "")
      .replace(moduleExportsRE, "")
      .replace(constRE, "var ")
      .replace(letRE, "var ");
    
    // Execute the data file in a fresh VM context
    const dataContext = vm.createContext({});
    try {
      vm.runInContext(fileContent, dataContext, { timeout: 1000 });
    } catch (e) {
      console.error(`${RED}  Error loading data from ${dataPath}: ${e.message}${RESET}`);
      process.exit(1);
    }
    
    // If exportName specified, return that property; otherwise return the first defined variable
    if (exportName) {
      if (!(exportName in dataContext)) {
        console.error(`${RED}  Error: __data("${dataPath}", "${exportName}") - "${exportName}" not found${RESET}`);
        process.exit(1);
      }
      return dataContext[exportName];
    }
    
    // Return the first non-undefined variable
    const keys = Object.keys(dataContext).filter(k => dataContext[k] !== undefined);
    if (keys.length === 0) {
      console.error(`${RED}  Error: __data("${dataPath}") - no variables found${RESET}`);
      process.exit(1);
    }
    return dataContext[keys[0]];
  };
  
  /** @type {string} */
  const transformed = scriptSrc
    .replace(constRE, "var ")
    .replace(letRE, "var ");

  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(transformed, context, { timeout: 1000 });
  } catch (e) {
    console.error(`${RED} Error in page script (${filename}): ${e.message}${RESET}`);
    process.exit(1);
  }

  // Merge sandbox output over defaults for meta (used in templates)
  /** @type {Record<string, string>} */
  const meta = { ...defaults, ...sandbox };

  return { meta, content, sandbox };
}