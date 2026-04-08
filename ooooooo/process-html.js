import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import {
  md5Hash,
  ensureDir,
  minifyCSS,
  minifyJS,
  YELLOW,
  RESET
} from "./utils.js";
import { getReactiveRuntime } from "./reactive-runtime.js";
import { renderTemplate } from "./curly-templates.js";
import { scopeCSS } from "./scope-css.js";
import { parsePageScript } from "./page-script.js";
import { wrapScript } from "./hydrate-wrap.js";
import { parsePropsAttributeValue, resolveProps } from "./component-props.js";
import { applyTemplate } from "./apply-template.js";
import { resolveSubscribeHydration } from "./resolve-subscribe-hydration.js";

/**
 * @param {string} distFile
 * @returns {string}
 * @description Compute the URL prefix from a built HTML file to `CONFIG.out` root.
 * @example dist/about/index.html → "../"
 */
function assetPrefixFromDistFile(distFile) {
  /** @type {string} */
  const dir = path.dirname(path.resolve(distFile));
  /** @type {string} */
  const outRoot = path.resolve(CONFIG.out);
  /** @type {string} */
  const rel = path.relative(dir, outRoot);

  if (!rel || rel === ".") {
    return "";
  }

  return rel.split(path.sep).join("/") + "/";
}


/**
 * @param {string} distFile — the HTML output file using this asset
 * @param {string} subDir — CONFIG.cssPath or CONFIG.jsPath (may be empty)
 * @returns {{ writeDir: string, urlPrefix: string }}
 * @description Resolve the filesystem write directory for an asset type and ensure it exists.
 * Returns the absolute write dir and the relative URL prefix from `distFile` to that dir.
 * @example
 * ```js
 * assetDir("dist/about/index.html", "css") → { writeDir: "dist/css", urlPrefix: "../css/" }
 * ```
 */
function assetDir(distFile, subDir) {
  /** @type {string} */
  const outRoot = path.resolve(CONFIG.out);
  /** @type {string} */
  const writeDir = subDir ? path.join(outRoot, subDir) : outRoot;

  ensureDir(writeDir);

  /** @type {string} */
  const htmlDir = path.dirname(path.resolve(distFile));

  /** @type {string} */
  const rel = path.relative(htmlDir, writeDir);

  /** @type {string} */
  const urlPrefix = rel ? rel.split(path.sep).join("/") + "/" : "";

  return { writeDir, urlPrefix };
}


/**
 * @param {{ 
 *  templates: Record<string, string>,
 *  components: Record<string, {
 *     template: string,
 *     style: string,
 *     styleCritical: boolean,
 *     scripts: Array<{hydrate: string, critical: boolean, code: string}>
 *   }>,
 *   styleScopes: Record<string, string>
 * }} ctx
 * @param {string} srcFile
 * @param {string} distFile
 * @returns {void}
 * @description Process the HTML file and write the processed HTML to the dist file.
 */
export function processHTML(ctx, srcFile, distFile) {

  /** @type {Record<string, string>} */
  const { templates, components, styleScopes } = ctx;
  /** @type {string} */
  const raw = fs.readFileSync(srcFile, "utf8");
  /** @type {string} */
  const filename = path.basename(srcFile);

  /** @type {string} */
  const assetPrefix = assetPrefixFromDistFile(distFile);

  // Parse the page script
  /** @type {{ meta: Record<string, string>, content: string, sandbox: Record<string, string> }} */
  const { meta, content, sandbox } = parsePageScript(raw, filename);

  // Apply the template to the content
  /** @type {string} */
  let html = applyTemplate(templates, content, meta, meta.template, srcFile);

  /** @type {string} */
  let criticalCSS = "";
  /** @type {string} */
  let criticalJS = "";
  /** @type {Array<{ href: string, preload: boolean }>} */
  let pageStyles = [];
  /** @type {Array<{ src: string, defer: boolean }>} */
  let pageScripts = [];

  for (const name in components) {

    /** @type { { template: string, style: string, styleCritical: boolean, scripts: Array<{ hydrate: string, critical: boolean, code: string }> } } */
    const comp = components[name];

    /** @type {string} */
    const scope = styleScopes[name];

    /** @type {RegExp} */
    const re = new RegExp(
      `<([A-Za-z][A-Za-z0-9]*)\\s+component=["']${name}["']([^>]*)>([\\s\\S]*?)<\\/\\1>`,
      "gi"
    );

    if (!re.test(html)) {
      continue;
    }

    re.lastIndex = 0;

    /** @type {string} */
    html = html.replace(re, (_, _tag, attrs) => {
      /** @type {string | null} */
      let propsExpr = parsePropsAttributeValue(attrs);
      if (propsExpr) {
        propsExpr = propsExpr.replace(/&#123;/g, "{").replace(/&#125;/g, "}");
      }

      /** @type {unknown | null} */
      const propsData = propsExpr ? resolveProps(propsExpr, sandbox, srcFile) : null;

      /** @type {string} */
      const propsAttr = propsData
        ? ` data-props="${JSON.stringify(propsData).replace(/"/g, "&quot;")}"`
        : "";

      /** @type {string} */
      let renderedMarkup = renderTemplate(comp.template, propsData || {});

      return `<div class="${scope}"${propsAttr}>${renderedMarkup}</div>`;
    });

    if (comp.styleCritical && comp.style) {
      criticalCSS += minifyCSS(scopeCSS(comp.style, scope)) + " ";
    }
    for (const s of comp.scripts) {
      if (!s.critical) continue;
      const subscribeSelector = resolveSubscribeHydration(s, name, styleScopes);
      criticalJS += minifyJS(wrapScript(s.code, s.hydrate, `.${scope}`, s.visiblePercent, s.timeMs, name, s.subscribeDep, subscribeSelector, s.interactSelector, s.interactEvent, s.interactGlobal)) + "\n";
    }
  }

  /** @type {RegExp} */
  const styleRE = /<style(\s+critical)?(\s+preload)?\s*>([\s\S]*?)<\/style>/gi;
  /** @type {RegExpMatchArray | null} */
  let styleMatch;
  /** @type {string} */
  let cleanedRaw = raw;

  while ((styleMatch = styleRE.exec(raw)) !== null) {
    /** @type {boolean} */
    const isCritical = !!styleMatch[1];
    /** @type {boolean} */
    const isPreload = !!styleMatch[2];
    /** @type {string} */
    const cssContent = styleMatch[3].trim();

    cleanedRaw = cleanedRaw.replace(styleMatch[0], "");

    if (isCritical && isPreload) {
      console.warn(`${YELLOW}Warning: <style> cannot be both critical and preload in ${filename}. Falling back to critical.${RESET}`);
    }

    if (isCritical) {
      criticalCSS += minifyCSS(cssContent) + " ";
    } else {
      /** @type {string} */
      const hash = md5Hash(cssContent, { prefix: "p-", length: 8 });
      /** @type {string} */
      const cssFilename = `${hash}.css`;
      const { writeDir: cssWriteDir, urlPrefix: cssUrlPrefix } = assetDir(distFile, CONFIG.cssPath);
      fs.writeFileSync(path.join(cssWriteDir, cssFilename), minifyCSS(cssContent));

      pageStyles.push({
        href: cssUrlPrefix + cssFilename,
        preload: isPreload
      });
    }
  }

  /** @type {RegExp} */
  const moduleScriptRE = /<script type="module"([^>]*)>([\s\S]*?)<\/script>/gi;
  /** @type {RegExpMatchArray | null} */
  let scriptMatch;

  while ((scriptMatch = moduleScriptRE.exec(raw)) !== null) {
    /** @type {string} */
    const attrsStr = scriptMatch[1] || "";
    /** @type {string} */
    const code = scriptMatch[2].trim();

    cleanedRaw = cleanedRaw.replace(scriptMatch[0], "");

    /** @type {boolean} */
    const isCritical = /\bcritical\b/i.test(attrsStr);
    /** @type {boolean} */
    const hasDefer = /\bdefer\b/i.test(attrsStr);

    if (isCritical) {
      criticalJS += minifyJS(code) + "\n";
    } else {
      /** @type {string} */
      const hash = md5Hash(code, { prefix: "p-", length: 8 });
      /** @type {string} */
      const scriptFilename = `${hash}.js`;
      const { writeDir: jsWriteDir, urlPrefix: jsUrlPrefix } = assetDir(distFile, CONFIG.jsPath);
      fs.writeFileSync(path.join(jsWriteDir, scriptFilename), minifyJS(code));

      pageScripts.push({
        src: jsUrlPrefix + scriptFilename,
        defer: hasDefer
      });
    }
  }

  /** @type {RegExp} */
  const entireStyleRE = /<style(\s+critical)?(\s+preload)?\s*>[\s\S]*?<\/style>/gi;
  /** @type {RegExp} */
  const entireScriptRE = /<script type="module"[^>]*>[\s\S]*?<\/script>/gi;

  html = html.replace(entireStyleRE, "");
  html = html.replace(entireScriptRE, "");

  if (criticalCSS) {
    html = html.replace("</head>", ` <style>${criticalCSS.trim()}</style>\n</head>`);
  }

  if (!html.includes(CONFIG.cssFile)) {
    const { urlPrefix: cssRootPrefix } = assetDir(distFile, CONFIG.cssPath);
    html = html.replace("</head>", ` <link rel="stylesheet" href="${cssRootPrefix}${CONFIG.cssFile}">\n</head>`);
  }

  for (const style of pageStyles) {
    if (style.preload) {
      const preloadLink = `
        <link rel="preload" href="${style.href}" as="style" onload="this.rel='stylesheet'">
        <noscript><link rel="stylesheet" href="${style.href}"></noscript>
      `.trim();
      html = html.replace("</head>", ` ${preloadLink}\n</head>`);
    } else {
      html = html.replace("</head>", ` <link rel="stylesheet" href="${style.href}">\n</head>`);
    }
  }

  if (criticalJS) {
    /** @type {string} */
    const criticalWithRuntime = minifyJS(getReactiveRuntime()) + criticalJS.trim();
    html = html.replace("</body>", ` <script>${criticalWithRuntime}<\/script>\n</body>`);
  }

  for (const ps of pageScripts) {
    /** @type {string} */
    const deferAttr = ps.defer ? " defer" : "";
    html = html.replace("</body>",
      ` <script type="module" src="${ps.src}"${deferAttr}><\/script>\n</body>`);
  }

  if (!html.includes(CONFIG.jsFile)) {
    const { urlPrefix: jsRootPrefix } = assetDir(distFile, CONFIG.jsPath);
    html = html.replace("</body>", ` <script src="${jsRootPrefix}${CONFIG.jsFile}"><\/script>\n</body>`);
  }

  // __injectStyle() calls from the page top-script
  /** @type {Array<{href:string,rel:string,media:string|null,integrity:string|null,crossorigin:string|null,preconnect:boolean,dnsPrefetch:boolean}>} */
  const injectStyles = Array.isArray(meta.__injectStyles) ? meta.__injectStyles : [];
  for (const s of injectStyles) {
    const intAttr  = s.integrity   ? ` integrity="${s.integrity}"`   : "";
    const coAttr   = s.crossorigin ? ` crossorigin="${s.crossorigin}"` : "";
    if (s.preconnect) {
      html = html.replace("</head>", ` <link rel="preconnect" href="${new URL(s.href).origin}">\n</head>`);
    }
    if (s.dnsPrefetch) {
      html = html.replace("</head>", ` <link rel="dns-prefetch" href="${new URL(s.href).origin}">\n</head>`);
    }
    if (s.rel === "preload") {
      const tag = `<link rel="preload" href="${s.href}" as="style" onload="this.rel='stylesheet'"${intAttr}${coAttr}>\n<noscript><link rel="stylesheet" href="${s.href}"${intAttr}${coAttr}></noscript>`;
      html = html.replace("</head>", ` ${tag}\n</head>`);
    } else if (s.rel === "media") {
      const mediaVal = s.media || "print";
      const tag = `<link rel="stylesheet" href="${s.href}" media="${mediaVal}" onload="this.media='all'"${intAttr}${coAttr}>`;
      html = html.replace("</head>", ` ${tag}\n</head>`);
    } else {
      const mediaAttr = s.media ? ` media="${s.media}"` : "";
      html = html.replace("</head>", ` <link rel="stylesheet" href="${s.href}"${mediaAttr}${intAttr}${coAttr}>\n</head>`);
    }
  }

  // __injectScript() calls from the page top-script
  /** @type {Array<{src:string,delivery:string,integrity:string|null,crossorigin:string|null,preconnect:boolean,dnsPrefetch:boolean}>} */
  const injectScripts = Array.isArray(meta.__injectScripts) ? meta.__injectScripts : [];
  for (const s of injectScripts) {
    const intAttr = s.integrity   ? ` integrity="${s.integrity}"`   : "";
    const coAttr  = s.crossorigin ? ` crossorigin="${s.crossorigin}"` : "";
    if (s.preconnect) {
      html = html.replace("</head>", ` <link rel="preconnect" href="${new URL(s.src).origin}">\n</head>`);
    }
    if (s.dnsPrefetch) {
      html = html.replace("</head>", ` <link rel="dns-prefetch" href="${new URL(s.src).origin}">\n</head>`);
    }
    if (s.delivery === "preload") {
      const tag = `<link rel="preload" href="${s.src}" as="script"${intAttr}${coAttr}>\n<noscript><script src="${s.src}"${intAttr}${coAttr}><\/script></noscript>`;
      html = html.replace("</body>", ` ${tag}\n</body>`);
    } else if (s.delivery === "async") {
      html = html.replace("</body>", ` <script src="${s.src}" async${intAttr}${coAttr}><\/script>\n</body>`);
    } else if (s.delivery === "defer") {
      html = html.replace("</body>", ` <script src="${s.src}" defer${intAttr}${coAttr}><\/script>\n</body>`);
    } else if (s.delivery === "module") {
      html = html.replace("</body>", ` <script type="module" src="${s.src}"${intAttr}${coAttr}><\/script>\n</body>`);
    } else {
      html = html.replace("</body>", ` <script src="${s.src}"${intAttr}${coAttr}><\/script>\n</body>`);
    }
  }

  ensureDir(path.dirname(distFile));
  fs.writeFileSync(distFile, html);
  console.log(` ${YELLOW}${filename}${RESET} → ${path.relative(CONFIG.out, distFile)}`);
}

/**
 * @param {string} srcDir — the source directory
 * @param {string} distDir — the output directory
 * @param /**
 * @param {string} srcDir - the source directory
 * @param {string} distDir - the output directory
 * @param {{
 *  templates: Record<string, string>,
*   components: Record<string, {
*     template: string,
*     style: string,
*     styleCritical: boolean,
*     scripts: {
*       hydrate: string,
*       critical: boolean,
*       code: string
*     }[]
*   }>,
*   styleScopes: Record<string, string>
* }} ctx
 * @description Walk the HTML files in the src directory and process them.
 */
export function walkHTML(srcDir, distDir, ctx) {
  for (const f of fs.readdirSync(srcDir)) {
    if (f === CONFIG.componentDir || f === CONFIG.templateDir){
      continue;
    }

    /** @type {string} */
    const srcFull = path.join(srcDir, f);

    /** @type {string} */
    const distFull = path.join(distDir, f);

    if (fs.statSync(srcFull).isDirectory()) {
      walkHTML(srcFull, distFull, ctx);
    } else if (f.endsWith(".html")) {
      processHTML(ctx, srcFull, distFull);
    }
  }
}
