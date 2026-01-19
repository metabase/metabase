#!/usr/bin/env node
/**
 * Generates TypeScript declaration files (.d.ts) for CLJS modules.
 * This allows tsgo to understand the CLJS module exports.
 */

const fs = require("fs");
const path = require("path");

const CLJS_DEV_DIR = path.join(__dirname, "..", "target", "cljs_dev");

// Find all .js files that have module.exports
function findCljsModules() {
  const files = fs.readdirSync(CLJS_DEV_DIR).filter((f) => f.endsWith(".js") && !f.endsWith(".map"));

  const modulesWithExports = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(CLJS_DEV_DIR, file), "utf-8");
    if (content.includes("Object.defineProperty(module.exports")) {
      modulesWithExports.push(file);
    }
  }

  return modulesWithExports;
}

// Extract export names from a JS file
function extractExports(filename) {
  const content = fs.readFileSync(path.join(CLJS_DEV_DIR, filename), "utf-8");
  const exports = [];

  // Match: Object.defineProperty(module.exports, "name", ...
  const regex = /Object\.defineProperty\(module\.exports,\s*"([^"]+)"/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  return exports;
}

// Generate .d.ts content for a module
function generateDts(exports) {
  const lines = [
    "// Auto-generated TypeScript declarations for CLJS module",
    "// Do not edit manually - regenerate with: node bin/generate-cljs-dts.js",
    "",
  ];

  for (const name of exports) {
    // Use 'any' since exports can be functions, arrays, or objects
    lines.push(`export const ${name}: any;`);
  }

  lines.push("");
  return lines.join("\n");
}

// Main
function main() {
  const modules = findCljsModules();
  console.log(`Found ${modules.length} CLJS modules with exports`);

  let totalExports = 0;

  for (const module of modules) {
    const exports = extractExports(module);
    if (exports.length === 0) continue;

    totalExports += exports.length;

    const dtsFilename = module.replace(/\.js$/, ".d.ts");
    const dtsPath = path.join(CLJS_DEV_DIR, dtsFilename);
    const dtsContent = generateDts(exports);

    fs.writeFileSync(dtsPath, dtsContent);
    console.log(`  ${dtsFilename}: ${exports.length} exports`);
  }

  console.log(`\nGenerated declarations for ${totalExports} total exports`);
}

main();
