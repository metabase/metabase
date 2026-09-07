// Run by oxlint-import-resolver.test.mjs in a child process,
// once per WEBPACK_BUNDLE and MB_EDITION pair.
const assert = require("node:assert/strict");
const path = require("node:path");

const sdk = require("../../../build/embedding-sdk/rspack/resolve-config");
const {
  ENTERPRISE_SRC_PATH,
} = require("../../../build/shared/rspack/resolve-aliases");
const app = require("../../../build/shared/rspack/resolve-config");

// Snapshot what lint sees before full configuration loading can mutate shared objects.
const light = { app: structuredClone(app), sdk: structuredClone(sdk) };

const fromNodeModules = Object.keys(require.cache).find((file) =>
  file.includes(`${path.sep}node_modules${path.sep}`),
);
assert.equal(
  fromNodeModules,
  undefined,
  `lint's resolve configs must stay dependency free, but loaded ${fromNodeModules}`,
);

const SDK_ENTERPRISE_ALIASES = {
  "sdk-ee-plugins": "/sdk-plugins",
  "sdk-iframe-embedding-ee-plugins": "/sdk-iframe-embedding-plugins",
  "ee-overrides": "/overrides",
};

for (const [alias, subpath] of Object.entries(SDK_ENTERPRISE_ALIASES)) {
  assert.equal(
    light.sdk.resolve.alias[alias],
    ENTERPRISE_SRC_PATH + subpath,
    `${alias}: the SDK resolves to the enterprise tree in every edition`,
  );
  if (process.env.MB_EDITION === "ee") {
    assert.equal(
      light.app.resolve.alias[alias],
      light.sdk.resolve.alias[alias],
      `${alias}: EE app`,
    );
  } else {
    assert.ok(
      !light.app.resolve.alias[alias].startsWith(ENTERPRISE_SRC_PATH),
      `${alias}: the OSS app must resolve to a noop stub, got ${light.app.resolve.alias[alias]}`,
    );
  }
}

for (const [name, snapshot, full] of [
  ["app", light.app, require("../../../../rspack.main.config")],
  ["sdk", light.sdk, require("../../../../rspack.embedding-sdk-bundle.config")],
]) {
  assert.deepEqual(snapshot.resolve, full.resolve, `${name}: resolve`);
  assert.deepEqual(snapshot.externals, full.externals, `${name}: externals`);
}
