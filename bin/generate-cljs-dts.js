#!/usr/bin/env node
/**
 * Generates TypeScript declaration files (.d.ts) for CLJS modules.
 * This allows tsgo to understand the CLJS module exports.
 */

const fs = require("fs");
const path = require("path");

const CLJS_DEV_DIR = path.join(__dirname, "..", "target", "cljs_dev");
const CLJS_RELEASE_DIR = path.join(__dirname, "..", "target", "cljs_release");

function hasJsFiles(dir) {
  if (!fs.existsSync(dir)) {
    return false;
  }
  const files = fs.readdirSync(dir);
  return files.some((f) => f.endsWith(".js") && !f.endsWith(".map"));
}

function getCljsDir() {
  // Prefer release dir if it has actual JS files, otherwise use dev
  if (hasJsFiles(CLJS_RELEASE_DIR)) {
    return CLJS_RELEASE_DIR;
  }
  return CLJS_DEV_DIR;
}

// Find all .js files that have module.exports
function findCljsModules() {
  const cljsDir = getCljsDir();
  const files = fs.readdirSync(cljsDir).filter((f) => f.endsWith(".js") && !f.endsWith(".map"));

  const modulesWithExports = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(cljsDir, file), "utf-8");
    // Dev format: Object.defineProperty(module.exports, "name", ...)
    // Release format: module.exports={name:function...}
    if (content.includes("Object.defineProperty(module.exports") ||
        content.includes("module.exports={")) {
      modulesWithExports.push(file);
    }
  }

  return modulesWithExports;
}

// Extract export names from a JS file
function extractExports(filename) {
  const cljsDir = getCljsDir();
  const content = fs.readFileSync(path.join(cljsDir, filename), "utf-8");
  const exports = [];

  // Dev format: Object.defineProperty(module.exports, "name", ...
  const devRegex = /Object\.defineProperty\(module\.exports,\s*"([^"]+)"/g;
  let match;

  while ((match = devRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  // Release format: module.exports={name:function...,name2:...}
  // Extract top-level keys from the object literal
  if (exports.length === 0 && content.includes("module.exports={")) {
    const startIdx = content.indexOf("module.exports={");
    if (startIdx !== -1) {
      const objContent = content.slice(startIdx);
      // Match keys that appear after { or , followed by identifier and colon
      const keyRegex = /[{,]([a-zA-Z_$][a-zA-Z0-9_$]*):/g;
      while ((match = keyRegex.exec(objContent)) !== null) {
        exports.push(match[1]);
      }
    }
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
  const cljsDir = getCljsDir();
  const modules = findCljsModules();
  console.log(`Found ${modules.length} CLJS modules with exports`);

  let totalExports = 0;

  for (const module of modules) {
    const exports = extractExports(module);
    if (exports.length === 0) continue;

    totalExports += exports.length;

    const dtsFilename = module.replace(/\.js$/, ".d.ts");
    const dtsPath = path.join(cljsDir, dtsFilename);
    const dtsContent = generateDts(exports);

    fs.writeFileSync(dtsPath, dtsContent);
    console.log(`  ${dtsFilename}: ${exports.length} exports`);
  }

  console.log(`\nGenerated declarations for ${totalExports} total exports`);
}

main();
