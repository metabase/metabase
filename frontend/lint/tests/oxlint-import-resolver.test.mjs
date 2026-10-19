import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ResolverFactory } from "oxc-resolver";

import { relative as upstreamImportX } from "eslint-plugin-import-x/utils/resolve";

import { createImportResolverService } from "../oxlint-import-resolver.mjs";

const repository = path.resolve(import.meta.dirname, "../../..");

const require = createRequire(import.meta.url);
const { relative: upstreamLegacy } = require("eslint-module-utils/resolve");

function fixture(t) {
  // Upstream resolvers report real paths, so the fixture tree must be free of symlinked parents.
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "metabase-resolver-test-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function write(file, content = "export default 1;\n") {
    const filename = path.join(root, file);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
    return filename;
  }
  write("package.json", JSON.stringify({ name: "resolver-fixture" }));
  // The webpack resolver chooses enhanced-resolve through the fixture's webpack installation.
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
  const resolverConfig = { node: true, webpack: { config, typescript: true } };
  const settings = {
    "import-x/resolver": resolverConfig,
    "import/resolver": resolverConfig,
  };
  const service = createImportResolverService({ ResolverFactory });
  return { root, file, settings, service, write };
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
      upstreamImportX(source, file, settings, context),
      `import-x: ${source}`,
    );
    assert.equal(
      service.resolveImport(source, context),
      upstreamLegacy(source, file, settings),
      `legacy: ${source}`,
    );
  }
}

test("should match upstream aliases, extensions, loaders, externals and builtins", (t) => {
  const data = fixture(t);
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

test("should match upstream package entries and symlink paths", (t) => {
  const data = fixture(t);
  const { write, root, service, settings, file } = data;
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
    service.forSettings(settings).resolve("fixture-package", file).path,
    path.join(root, "node_modules/fixture-package/esm.js"),
  );
  assert.equal(
    service.forSettings(settings, "import").resolve("fixture-package", file)
      .path,
    path.join(root, "node_modules/fixture-package/cjs.js"),
  );
});

test("should distinguish source directories and resolver configurations", (t) => {
  const data = fixture(t);
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

test("should reuse bare imports within each package root", (t) => {
  const data = fixture(t);
  const { root, settings, service, write } = data;
  write(
    "node_modules/fixture-shared/package.json",
    JSON.stringify({ name: "fixture-shared", main: "./outer.js" }),
  );
  write("node_modules/fixture-shared/outer.js");
  write("src/deep/importer.ts");
  // A nested node_modules gives the same bare specifier a different target.
  write("nested/package.json", JSON.stringify({ name: "nested-fixture" }));
  write("nested/importer.ts");
  write(
    "nested/node_modules/fixture-shared/package.json",
    JSON.stringify({ name: "fixture-shared", main: "./inner.js" }),
  );
  write("nested/node_modules/fixture-shared/inner.js");
  write("plain/package.json", JSON.stringify({ name: "plain-fixture" }));
  write("plain/importer.ts");

  const files = {
    shallow: data.file,
    deep: path.join(root, "src/deep/importer.ts"),
    nested: path.join(root, "nested/importer.ts"),
    plain: path.join(root, "plain/importer.ts"),
  };
  for (const file of Object.values(files)) {
    compare({ ...data, file }, [
      "fixture-shared",
      "fixture-shared?raw",
      "fixture-shared/inner.js",
      "./sibling",
      "app/sibling",
      "fixture-loader!./sibling.ts",
    ]);
  }

  let nativeCalls = 0;
  class CountingResolver {
    constructor(options) {
      this.inner = new ResolverFactory(options);
    }
    sync(directory, source) {
      nativeCalls++;
      return this.inner.sync(directory, source);
    }
  }
  const counted = createImportResolverService({
    ResolverFactory: CountingResolver,
  }).forSettings(settings);
  for (const file of [
    files.shallow,
    files.deep,
    files.nested,
    files.plain,
    files.shallow,
  ]) {
    counted.resolve("fixture-shared", file);
  }
  assert.equal(nativeCalls, 3, "one native resolution per package root");

  const outer = path.join(root, "node_modules/fixture-shared/outer.js");
  const inner = path.join(root, "nested/node_modules/fixture-shared/inner.js");
  for (const { source, from, expected } of [
    { source: "fixture-shared", from: "shallow", expected: outer },
    { source: "fixture-shared", from: "deep", expected: outer },
    { source: "fixture-shared", from: "plain", expected: outer },
    { source: "fixture-shared", from: "nested", expected: inner },
    { source: "fixture-shared?raw", from: "shallow", expected: `${outer}?raw` },
    { source: "fixture-shared?raw", from: "nested", expected: `${inner}?raw` },
    {
      source: "./sibling",
      from: "shallow",
      expected: path.join(root, "src/sibling.ts"),
    },
    { source: "./sibling", from: "deep", expected: undefined },
    {
      source: "fixture-loader!./sibling.ts",
      from: "shallow",
      expected: path.join(root, "src/sibling.ts"),
    },
    {
      source: "fixture-loader!./sibling.ts",
      from: "deep",
      expected: undefined,
    },
  ]) {
    assert.equal(
      service.forSettings(settings).resolve(source, files[from]).path,
      expected,
      `${source} from ${from}`,
    );
  }
});

test("should find newly created files through a fresh service", (t) => {
  const data = fixture(t);
  const before = data.service.forSettings(data.settings);
  assert.equal(before.resolve("app/created", data.file).found, false);
  data.write("src/created.ts");
  const after = createImportResolverService({ ResolverFactory });
  assert.equal(
    after.forSettings(data.settings).resolve("app/created", data.file).path,
    path.join(data.root, "src/created.ts"),
  );
});

test("should reject unsupported resolver policies", (t) => {
  const service = createImportResolverService({ ResolverFactory });
  for (const settings of [
    { "import-x/resolver-next": [] },
    { "import-x/resolve": { extensions: [".custom"] } },
    { "import-x/resolver": { node: { extensions: [".custom"] } } },
    { "import-x/resolver": { node: true, typescript: true } },
  ]) {
    assert.throws(() => service.forSettings(settings), /Unsupported resolver/);
  }
  const data = fixture(t);
  for (const { file, source, error } of [
    {
      file: "relative-alias.config.cjs",
      source: 'module.exports = { resolve: { alias: { app: "./src" } } };',
      error: /Unsupported resolver alias/,
    },
    {
      file: "relative-fallback.config.cjs",
      source: 'module.exports = { resolve: { fallback: { app: "./src" } } };',
      error: /Unsupported resolver alias/,
    },
    {
      file: "unsupported.config.cjs",
      source: "module.exports = { resolve: { plugins: [{}] } };",
      error: /Unsupported Rspack resolve option/,
    },
  ]) {
    const config = data.write(file, source);
    assert.throws(
      () =>
        data.service.forSettings({
          ...data.settings,
          "import-x/resolver": { node: true, webpack: { config } },
        }),
      error,
    );
  }
});

for (const WEBPACK_BUNDLE of ["development", "production"]) {
  for (const MB_EDITION of ["oss", "ee"]) {
    test(`should match build aliases in ${WEBPACK_BUNDLE}/${MB_EDITION}`, () => {
      // Build settings are evaluated at module load, so each environment needs a fresh process.
      execFileSync(
        process.execPath,
        [path.join(import.meta.dirname, "fixtures/resolve-config-parity.js")],
        {
          cwd: repository,
          env: { ...process.env, WEBPACK_BUNDLE, MB_EDITION },
          encoding: "utf8",
          timeout: 60_000,
        },
      );
    });
  }
}
