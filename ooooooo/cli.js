#!/usr/bin/env node

/** @type {string} */
const [, , command] = process.argv;

if (!command || command === "build") {
  import("../build.js");
} else if (command === "init") {
  import("./init.js").then(({ runInit }) => runInit());
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Usage:");
  console.error("  ooo init    — scaffold a new src/ directory");
  console.error("  ooo build   — build the project");
  process.exit(1);
}
