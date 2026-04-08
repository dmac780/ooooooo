import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GREEN, YELLOW, RED, RESET } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCAFFOLD_DIR    = path.join(__dirname, "_scaffold");
const SCAFFOLD_SRC    = path.join(SCAFFOLD_DIR, "src");
const TARGET_DIR      = path.join(process.cwd(), "src");
const SCAFFOLD_CONFIG = path.join(SCAFFOLD_DIR, "ooo.config.js");
const TARGET_CONFIG   = path.join(process.cwd(), "ooo.config.js");

/**
 * Recursively copy a directory.
 * @param {string} src
 * @param {string} dest
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src,  entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ${GREEN}created${RESET} ${path.relative(process.cwd(), destPath)}`);
    }
  }
}

/**
 * @returns {void}
 * @description Run the init command to scaffold a new ooooooo project.
 */
export function runInit() {
  if (fs.existsSync(TARGET_DIR)) {
    console.warn(`\n${YELLOW}  Warning: src/ already exists — skipping init to avoid overwriting your project.${RESET}`);
    console.warn(`  Delete or rename src/ first if you want a fresh scaffold.\n`);
    process.exit(0);
  }

  if (!fs.existsSync(SCAFFOLD_SRC)) {
    console.error(`${RED}  Error: scaffold missing at ${SCAFFOLD_SRC}${RESET}`);
    process.exit(1);
  }

  console.log("\nInitialising ooooooo project...\n");

  copyDir(SCAFFOLD_SRC, TARGET_DIR);

  if (!fs.existsSync(TARGET_CONFIG)) {
    fs.copyFileSync(SCAFFOLD_CONFIG, TARGET_CONFIG);
    console.log(`  ${GREEN}created${RESET} ooo.config.js`);
  } else {
    console.log(`  ${YELLOW}skipped${RESET} ooo.config.js (already exists)`);
  }

  const pkgPath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify({ type: "module" }, null, 2) + "\n");
    console.log(`  ${GREEN}created${RESET} package.json`);
  } else {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.type !== "module") {
      pkg.type = "module";
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(`  ${GREEN}updated${RESET} package.json — added "type": "module"`);
    }
  }

  console.log(`\n${GREEN}✓ Done. Run \`npx ooo build\` to build.${RESET}\n`);
}
