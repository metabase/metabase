#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const outputDirectory = path.resolve(process.argv[2] ?? "target/cljs_dev");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "metabase-cljs-dts-"));
const configPath = path.join(temporaryDirectory, "tsconfig.json");

try {
  await writeFile(
    configPath,
    JSON.stringify({
      extends: path.resolve("tsconfig.base.json"),
      compilerOptions: {
        allowJs: false,
        incremental: false,
        noEmit: true,
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
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
