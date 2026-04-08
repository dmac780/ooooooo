import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * @typedef {Object} CONFIG
 * @property {string} src          - source directory
 * @property {string} out          - output (dist) directory
 * @property {string} componentDir - component directory name inside src
 * @property {string} templateDir  - template directory name inside src
 * @property {string} cssFile      - filename for the compiled component stylesheet
 * @property {string} jsFile       - filename for the compiled component bundle
 * @property {string} cssPath      - subdirectory inside dist to write CSS files ("" = dist root)
 * @property {string} jsPath       - subdirectory inside dist to write JS files  ("" = dist root)
 */
const DEFAULTS = {
  src:          "src",
  out:          "dist",
  componentDir: "_components",
  templateDir:  "_templates",
  cssFile:      "styles.css",
  jsFile:       "components.js",
  cssPath:      "",
  jsPath:       "",
};

const userConfigPath = path.join(process.cwd(), "ooo.config.js");
let userOverrides = {};

if (fs.existsSync(userConfigPath)) {
  const mod = await import(pathToFileURL(userConfigPath).href);
  userOverrides = mod.default ?? {};
}

export const CONFIG = { ...DEFAULTS, ...userOverrides };
