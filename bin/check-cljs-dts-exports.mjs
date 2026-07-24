#!/usr/bin/env node

import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDirectory = path.resolve("target/cljs_dev");
const require = createRequire(import.meta.url);
const valueDeclarationPattern =
  /^export\s+(?:declare\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;

function declaredValues(source) {
  return new Set(
    Array.from(source.matchAll(valueDeclarationPattern), (match) => match[1]),
  );
}

function difference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

async function expectedModules() {
  const manifestPath = path.join(outputDirectory, "cljs-dts-modules.txt");
  const manifest = await readFile(manifestPath, "utf8");
  return manifest.split("\n").filter(Boolean).sort();
}

async function declarationModules() {
  const files = await readdir(outputDirectory);
  return files
    .filter(
      (file) => file.endsWith(".d.ts") && file !== "metabase.lib.shared.d.ts",
    )
    .map((file) => file.slice(0, -".d.ts".length))
    .sort();
}

async function checkModule(moduleName) {
  const declarationPath = path.join(outputDirectory, `${moduleName}.d.ts`);
  const runtimePath = path.join(outputDirectory, `${moduleName}.js`);
  const declarationSource = await readFile(declarationPath, "utf8");
  const declared = declaredValues(declarationSource);
  const runtime = new Set(Object.keys(require(runtimePath)));
  const missing = difference(runtime, declared);
  const extra = difference(declared, runtime);

  if (missing.length === 0 && extra.length === 0) {
    console.log(`✓ ${moduleName}: ${runtime.size} runtime exports`);
    return true;
  }

  console.error(`✗ ${moduleName}`);
  if (missing.length > 0) {
    console.error(`  missing declarations: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    console.error(`  declarations without runtime values: ${extra.join(", ")}`);
  }
  return false;
}

let exitCode = 0;
try {
  const expected = new Set(await expectedModules());
  const actual = new Set(await declarationModules());
  if (expected.size === 0) {
    throw new Error(
      `No generated declaration modules listed in ${outputDirectory}`,
    );
  }

  const missingModules = difference(expected, actual);
  const unexpectedModules = difference(actual, expected);
  if (missingModules.length > 0) {
    console.error(`Missing declaration modules: ${missingModules.join(", ")}`);
    exitCode = 1;
  }
  if (unexpectedModules.length > 0) {
    console.error(
      `Unexpected declaration modules: ${unexpectedModules.join(", ")}`,
    );
    exitCode = 1;
  }

  for (const moduleName of expected) {
    if (actual.has(moduleName) && !(await checkModule(moduleName))) {
      exitCode = 1;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  exitCode = 1;
}

process.exit(exitCode);
