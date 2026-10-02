import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const fixtureSource = path.resolve("target/cljs_dev");

test("accepts any in comments and string literal types", async () => {
  const outputDirectory = await mkdtemp(
    path.join(tmpdir(), "metabase-cljs-dts-test-"),
  );
  try {
    await cp(fixtureSource, outputDirectory, { recursive: true });
    const declaration = path.join(outputDirectory, "metabase.lib.limit.d.ts");
    await writeFile(
      declaration,
      `${await readFile(declaration, "utf8")}\n// any is allowed in comments\nexport type ParserStringProbe = "any";\n`,
    );
    const result = spawnSync(
      "node",
      ["bin/type-check-cljs-dts.mjs", outputDirectory],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("rejects explicit any in generated declarations", async () => {
  const outputDirectory = await mkdtemp(
    path.join(tmpdir(), "metabase-cljs-dts-test-"),
  );
  try {
    await cp(fixtureSource, outputDirectory, { recursive: true });
    const declaration = path.join(outputDirectory, "metabase.lib.limit.d.ts");
    await writeFile(
      declaration,
      `${await readFile(declaration, "utf8")}\nexport const parser_probe: any;\n`,
    );
    const result = spawnSync(
      "node",
      ["bin/type-check-cljs-dts.mjs", outputDirectory],
      {
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /Explicit any/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
