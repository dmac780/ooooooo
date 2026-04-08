import fs from "fs";
import path from "path";
import { CONFIG } from "./ooooooo/config.js";
import { 
  md5Hash, 
  ensureDir,
  minifyCSS,
  minifyJS,
  copyDir,
  cleanDist,
  GREEN,
  YELLOW,
  RED,
  RESET
} from "./ooooooo/utils.js";
import { getReactiveRuntime } from "./ooooooo/reactive-runtime.js";
import { scopeCSS } from "./ooooooo/scope-css.js";
import { parseComponent } from "./ooooooo/parse-component.js";
import { wrapScript } from "./ooooooo/hydrate-wrap.js";
import { resolveSubscribeHydration } from "./ooooooo/resolve-subscribe-hydration.js";
import { walkHTML } from "./ooooooo/process-html.js";

/*                                                      
 _____ _____ _____ _____ __    _____ _____ _____ _____ 
 |_   _|   __|     |  _  |  |  |  _  |_   _|   __|   __|
   | | |   __| | | |   __|  |__|     | | | |   __|__   |
   |_| |_____|_|_|_|__|  |_____|__|__| |_| |_____|_____|

*/                                                      
//
// src/_templates/index.template  — required, used by default
// src/_templates/about.template  — optional, used when template: about
//
// [content]     — default mount point for page body
// [title]       — from frontmatter
// [description] — from frontmatter
// [head]        — from frontmatter (for extra <link>, <script>, etc.)
// [schema]      — from frontmatter (JSON-LD, etc.)
// [nav]         — data-component="nav" in template, or frontmatter override
// [footer]      — same
// Any [key] not in frontmatter → replaced with ""

/** @type {string} */
const templateDir = path.join(CONFIG.src, CONFIG.templateDir);

/** @type {Record<string, string>} */
const templates = {};

if (!fs.existsSync(templateDir)) {
  console.error(`${RED}  Error: _templates/ directory not found at "${templateDir}"${RESET}`);
  process.exit(1);
}

for (const file of fs.readdirSync(templateDir)) {
  if (!file.endsWith(".template")) {
    continue;
  }

  /** @type {string} */
  const name = file.replace(".template", "");

  /** @type {string} */
  templates[name] = fs.readFileSync(path.join(templateDir, file), "utf8");

  console.log(`  Loaded template: ${name}`);
}

if (!templates["index"]) {
  console.error(`${RED}  Error: index.template not found in "${templateDir}"${RESET}`);
  process.exit(1);
}

/**
 _____ _____ _____ _____ _____ _____ _____ _____ _____ _____ 
|     |     |     |  _  |     |   | |   __|   | |_   _|   __|
|   --|  |  | | | |   __|  |  | | | |   __| | | | | | |__   |
|_____|_____|_|_|_|__|  |_____|_|___|_____|_|___| |_| |_____|
                                                             
 */

/** @type {Record<string, { template: string, style: string, styleCritical: boolean, scripts: Array<{ hydrate: string, critical: boolean, code: string }> }>} */
const components = {};

/** @type {string} */
const compDir    = path.join(CONFIG.src, CONFIG.componentDir);

/** @type {string} */
const componentFileExt = ".component";

if (fs.existsSync(compDir)) {
  for (const file of fs.readdirSync(compDir)) {
    if (!file.endsWith(componentFileExt)) {
      continue;
    }

    /** @type {string} */
    const name = file.replace(componentFileExt, "");

    components[name] = parseComponent(path.join(compDir, file));
    console.log(`  Loaded component: ${name}`);
  }
}

/*
 _____ _____ _____    _____ _____ _____ ____  __    _____ 
|     |   __|   __|  | __  |  |  |   | |    \|  |  |   __|
|   --|__   |__   |  | __ -|  |  | | | |  |  |  |__|   __|
|_____|_____|_____|  |_____|_____|_|___|____/|_____|_____|
                                                          
*/
// Scopes each non-critical component style with a hash class.
// @media blocks: the query itself is NOT scoped, only its inner rules are.
//
//   Input:  button { color: red; }
//   Output: .cXXXXXXXX button { color: red; }

/** @type {Record<string, string>} */
const styleScopes = {};

/** @type {string} */
let allCSS = "";

for (const name in components) {

  /** @type { { template: string, style: string, styleCritical: boolean, scripts: Array<{ hydrate: string, critical: boolean, code: string }> } } */
  const comp  = components[name];

  /** @type {string} */
  const scope = md5Hash(name, { prefix: "c", length: 8 });

  styleScopes[name] = scope;

  if (!comp.style || comp.styleCritical) {
    continue;
  }

  allCSS += scopeCSS(comp.style, scope) + "\n";
}

/*
    __ _____    _____ _____ _____ ____  __    _____ 
 __|  |   __|  | __  |  |  |   | |    \|  |  |   __|
|  |  |__   |  | __ -|  |  | | | |  |  |  |__|   __|
|_____|_____|  |_____|_____|_|___|____/|_____|_____|
                                                    
*/
// Hydration strategies:
//   load (default)    — DOMContentLoaded
//   now               — immediate IIFE
//   visible           — IntersectionObserver, fires once on enter
//   wait              — requestIdleCallback

/** @type {string} */
let allJS = minifyJS(getReactiveRuntime()) + "\n";

for (const name in components) {

  /** @type { { template: string, style: string, styleCritical: boolean, scripts: Array<{ hydrate: string, critical: boolean, code: string }> } } */
  const comp = components[name];
  for (const s of comp.scripts) {
    if (s.critical) {
      continue;
    }

    /** @type {string} */
    const selector = `.${styleScopes[name]}`;

    /** @type {string | null} */
    const subscribeSelector = resolveSubscribeHydration(s, name, styleScopes);

    allJS += minifyJS(wrapScript(s.code, s.hydrate, selector, s.visiblePercent, s.timeMs, name, s.subscribeDep, subscribeSelector, s.interactSelector, s.interactEvent, s.interactGlobal)) + "\n\n";
  }
}


/*                                
 _____ _____ _____ _____ _____ _____ _____ 
|     |     |     |     |     |     |     |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|_____|_____|_____|_____|_____|_____|_____|
                                                                                                      
 */
console.log("Running ooooooo...\n");

// 1. Clean the dist directory
cleanDist();

// 2. ensure the dist directory exists, if not, create it
ensureDir(CONFIG.out);

console.log(`${YELLOW}Starting fresh build...${RESET}`);

// 3. Copy static assets
//    images, fonts, etc. skipping _components and _templates
copyDir(CONFIG.src, CONFIG.out);

// 4. Write component bundles into configured output subdirectories
/** @type {string} */
const cssOutDir = CONFIG.cssPath ? path.join(CONFIG.out, CONFIG.cssPath) : CONFIG.out;
ensureDir(cssOutDir);

fs.writeFileSync(path.join(cssOutDir, CONFIG.cssFile), minifyCSS(allCSS));
console.log(` CSS written → ${CONFIG.cssPath ? CONFIG.cssPath + "/" : ""}${CONFIG.cssFile}`);

/** @type {string} */
const jsOutDir = CONFIG.jsPath ? path.join(CONFIG.out, CONFIG.jsPath) : CONFIG.out;
ensureDir(jsOutDir);

fs.writeFileSync(path.join(jsOutDir, CONFIG.jsFile), allJS);
console.log(` JS written → ${CONFIG.jsPath ? CONFIG.jsPath + "/" : ""}${CONFIG.jsFile}`);

// 5. Process all HTML pages 
//    this also generates page-specific p-*.js and p-*.css files
walkHTML(CONFIG.src, CONFIG.out, { templates, components, styleScopes });

console.log(`\n${GREEN}✓ ooooooo build complete.${RESET}`);