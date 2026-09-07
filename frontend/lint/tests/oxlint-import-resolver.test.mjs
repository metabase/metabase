import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { relative as originalImportX } from "eslint-plugin-import-x/utils/resolve";

import { createImportResolverService } from "../oxlint-import-resolver.mjs";

const require = createRequire(import.meta.url);
const { relative: originalLegacy } = require("eslint-module-utils/resolve");
const { ResolverFactory } = await import(
  process.env.METABASE_OXC_RESOLVER_MODULE ?? "oxc-resolver"
);

function fixture(run) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "metabase-resolver-test-")),
  );
  function write(file, content = "export default 1;\n") {
    const filename = path.join(root, file);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
    return filename;
  }
  try {
    write("package.json", JSON.stringify({ name: "resolver-fixture" }));
    // Give the upstream webpack resolver the same enhanced-resolve version it
    // uses in this repo; otherwise /tmp falls back to its bundled webpack 1 API.
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.symlinkSync(
      path.dirname(require.resolve("webpack/package.json")),
      path.join(root, "node_modules/webpack"),
      "dir",
    );
    const file = write("src/importer.ts");
    write("src/sibling.ts");
    write("src/CaseSensitive.ts");
    write("src/directory/index.tsx");
    write("src/style.css");
    write("src/literal?name.js");
    write("src/choice.js");
    write("src/choice.ts");
    write("other/sibling.ts");
    write("other/importer.ts");
    write("src/browser.js");
    write("src/fallback.js");
    const config = write(
      "webpack.config.cjs",
      `module.exports = ${JSON.stringify({
        resolve: {
          extensions: [".js", ".jsx", ".ts", ".tsx", ".css", ".svg"],
          alias: { app: path.join(root, "src") },
          fallback: { "fixture-fallback": path.join(root, "src/fallback.js") },
        },
        externals: { "fixture-external": "EXTERNAL" },
      })};`,
    );
    const resolverConfig = {
      node: true,
      webpack: { config, typescript: true },
    };
    const settings = {
      "import-x/resolver": resolverConfig,
      "import/resolver": resolverConfig,
    };
    const service = createImportResolverService({ ResolverFactory });
    return run({ root, file, settings, service, write });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function compare({ file, settings, service }, sources) {
  const context = {
    filename: file,
    physicalFilename: file,
    settings,
    parserOptions: {},
    cwd: process.cwd(),
  };
  for (const source of sources) {
    assert.equal(
      service.forSettings(settings).resolve(source, file).path,
      originalImportX(source, file, settings, context),
      `import-x: ${source}`,
    );
    assert.equal(
      service.resolveImport(source, context),
      originalLegacy(source, file, settings),
      `legacy: ${source}`,
    );
  }
}

test("matches aliases, extensions, loaders, externals, missing paths, and builtins", () => {
  fixture((data) => {
    compare(data, [
      "node:fs",
      "fs",
      "data:text/javascript,export default 1",
      "./sibling",
      "./directory",
      "./choice",
      "./style.css",
      "./style.css?inline",
      "./literal?name.js",
      "./CaseSensitive",
      "./casesensitive",
      "./missing",
      "app/sibling",
      "app/directory",
      "app/missing",
      "fixture-loader!app/style.css?inline",
      "fixture-external",
      "fixture-fallback",
      path.join(data.root, "src/sibling.ts"),
    ]);
    assert.equal(
      data.service.forSettings(data.settings).resolve("./missing", data.file)
        .found,
      false,
    );
  });
});

test("retains package exports, jsnext:main fallback, and symlink behavior", () => {
  fixture((data) => {
    const { write, root } = data;
    write(
      "node_modules/fixture-package/package.json",
      JSON.stringify({
        name: "fixture-package",
        exports: { ".": { import: "./esm.js", require: "./cjs.js" } },
        main: "./cjs.js",
      }),
    );
    write("node_modules/fixture-package/esm.js");
    write("node_modules/fixture-package/cjs.js");
    write("node_modules/fixture-package/private.js");
    write(
      "node_modules/fixture-jsnext/package.json",
      JSON.stringify({
        name: "fixture-jsnext",
        module: "./missing.js",
        "jsnext:main": "./jsnext.js",
        main: "./missing-too.js",
      }),
    );
    write("node_modules/fixture-jsnext/jsnext.js");
    fs.symlinkSync(
      path.join(root, "node_modules/fixture-package"),
      path.join(root, "node_modules/fixture-linked"),
      "dir",
    );
    compare(data, [
      "fixture-package",
      "fixture-package/private.js",
      "fixture-linked",
      "fixture-jsnext",
    ]);
    assert.equal(
      data.service
        .forSettings(data.settings)
        .resolve("fixture-package", data.file).path,
      path.join(root, "node_modules/fixture-package/esm.js"),
    );
    assert.equal(
      data.service
        .forSettings(data.settings, "import")
        .resolve("fixture-package", data.file).path,
      path.join(root, "node_modules/fixture-package/cjs.js"),
    );
  });
});

test("keeps source directories and resolver configurations separate", () => {
  fixture((data) => {
    const otherFile = path.join(data.root, "other/importer.ts");
    compare({ ...data, file: otherFile }, ["./sibling", "app/sibling"]);
    assert.notEqual(
      data.service.forSettings(data.settings).resolve("./sibling", data.file)
        .path,
      data.service.forSettings(data.settings).resolve("./sibling", otherFile)
        .path,
    );
    compare({ ...data, settings: {} }, ["app/sibling", "./sibling", "node:fs"]);
    assert.equal(
      data.service.forSettings({}).resolve("app/sibling", data.file).found,
      false,
    );
  });
});

test("a fresh service observes files created after a cached resolution miss", () => {
  fixture((data) => {
    const before = data.service.forSettings(data.settings);
    assert.equal(before.resolve("app/created", data.file).found, false);
    data.write("src/created.ts");
    const after = createImportResolverService({ ResolverFactory });
    assert.equal(
      after.forSettings(data.settings).resolve("app/created", data.file).path,
      path.join(data.root, "src/created.ts"),
    );
  });
});

test("rejects unsupported resolver policies instead of silently ignoring them", () => {
  const service = createImportResolverService({ ResolverFactory });
  for (const settings of [
    { "import-x/resolver-next": [] },
    { "import-x/resolve": { extensions: [".custom"] } },
    { "import-x/resolver": { node: { extensions: [".custom"] } } },
    { "import-x/resolver": { node: true, typescript: true } },
  ]) {
    assert.throws(() => service.forSettings(settings), /Unsupported resolver/);
  }
  fixture(({ service, settings, write }) => {
    const config = write(
      "unsupported.config.cjs",
      "module.exports = { resolve: { plugins: [{}] } };",
    );
    assert.throws(
      () =>
        service.forSettings({
          ...settings,
          "import-x/resolver": { node: true, webpack: { config } },
        }),
      /Unsupported Rspack resolve option/,
    );
  });
});
