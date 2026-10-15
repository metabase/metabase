#!/usr/bin/env node

import console from "node:console";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const outputDirectory = path.resolve(process.argv[2] ?? "target/cljs_dev");
async function generatedDeclarations(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".d.ts"))
    .map((entry) => path.join(directory, entry.name));
}

async function explicitAnyLocations(directory) {
  const declarations = await generatedDeclarations(directory);
  const locations = [];
  for (const declaration of declarations) {
    const source = ts.createSourceFile(
      declaration,
      await readFile(declaration, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        const { line, character } = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );
        locations.push(`${declaration}:${line + 1}:${character + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return locations;
}
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "metabase-cljs-dts-"),
);
const configPath = path.join(temporaryDirectory, "tsconfig.json");

try {
  const explicitAny = await explicitAnyLocations(outputDirectory);
  if (explicitAny.length > 0) {
    for (const location of explicitAny) {
      console.error(`Explicit any in generated declaration: ${location}`);
    }
    process.exitCode = 1;
  } else {
    await writeFile(
      configPath,
      JSON.stringify({
        extends: path.resolve("tsconfig.base.json"),
        compilerOptions: {
          allowJs: false,
          incremental: false,
          noEmit: true,
          paths: {
            "cljs/*": [path.join(outputDirectory, "*")],
          },
          exactOptionalPropertyTypes: true,
          skipLibCheck: false,
          strict: true,
        },
        include: [path.join(outputDirectory, "**/*.d.ts")],
        exclude: [path.resolve("node_modules")],
      }),
    );
    const result = spawnSync(
      path.resolve("node_modules/typescript7/bin/tsc"),
      ["-p", configPath],
      { stdio: "inherit" },
    );
    process.exitCode = result.status ?? 1;
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
