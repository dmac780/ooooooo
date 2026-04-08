import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";

/** @type {string} */
export const GREEN  = "\x1b[32m";
/** @type {string} */
export const YELLOW = "\x1b[33m";
/** @type {string} */
export const RED    = "\x1b[31m";
/** @type {string} */
export const RESET  = "\x1b[0m";

/**
 * @param {string} str - The string to hash
 * @param {object} { prefix = "c", length = 6 } 
 * @returns {string} - The MD5 hash of the string with a prefix and length (e.g. "c123456")
 * @description Generate a MD5 hash of a string
 */
export function md5Hash(str, { prefix = "c", length = 6 } = {}) {
  return (
    prefix +
    crypto.createHash("md5")
      .update(str)
      .digest("hex")
      .slice(0, length)
  );
}

/**
 * @param {string} dir - The directory to ensure exists
 * @returns {void}
 * @description Ensure a directory exists, creating it if it doesn't.
 */
export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * @param {string} css - The CSS string to minify
 * @returns {string} - The minified CSS string
 * @description Minify a CSS string by removing whitespace and redundant characters.
 */
export function minifyCSS(css) {
  return css
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .trim();
}

/**
 * @param {string} js - The JavaScript string to minify
 * @returns {string} - The minified JavaScript string
 * @description Minify a JavaScript string by removing whitespace and redundant characters.
 * Strip `//` line comments without touching `//` inside strings (e.g. "https://...").
 */
export function minifyJS(js) {
  /** @type {string} */
  let out = "";
  /** @type {number} */
  let i = 0;
  /** @type {number} */
  const len = js.length;

  while (i < len) {

    /** @type {string} */
    const c = js[i];

    if (c === '"' || c === "'" || c === "`") {
      /** @type {string} */
      const q = c;
      out += q;
      i++;
      while (i < len) {
        if (js[i] === "\\") {
          out += js[i++];
          if (i < len) out += js[i++];
          continue;
        }
        if (js[i] === q) {
          out += js[i++];
          break;
        }
        out += js[i++];
      }
      continue;
    }

    if (c === "/" && js[i + 1] === "/") {
      i += 2;
      while (i < len && js[i] !== "\n" && js[i] !== "\r") i++;
      continue;
    }

    out += c;
    i++;
  }

  return out.replace(/\s+/g, " ").trim();
}


/**
 * @param {string} src
 * @param {string} out
 * @returns {void}
 * @description Copy src → out, skipping _components, _templates, _data, and .html files.
 * HTML is handled by the template pipeline. Assets copy straight over.
 * Anything starting with _ is build-time only.
 */
export function copyDir(src, out) {
  ensureDir(out);
  for (const item of fs.readdirSync(src)) {
    if (item.startsWith("_")) {
      continue; // Skip all _prefixed folders (build-time only)
    }
    /** @type {string} */
    const s    = path.join(src, item);
    /** @type {string} */
    const d    = path.join(out, item);
    /** @type {fs.Stats} */
    const stat = fs.statSync(s);

    if (stat.isDirectory()) {
      copyDir(s, d);
    } else if (!item.endsWith(".html")) {
      fs.copyFileSync(s, d);
    }
  }
}

/**
   * @returns {void}
   * @description Completely remove the dist directory before rebuilding
   * This ensures old files (deleted pages, old hashed assets, etc.) are removed
 */
export function cleanDist() {
  if (fs.existsSync(CONFIG.out)) {
    fs.rmSync(CONFIG.out, { recursive: true, force: true });
    console.log(`${YELLOW}Cleaned dist/ directory${RESET}`);
  }
}