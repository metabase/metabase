import { join, resolve } from "path";
import { runInNewContext } from "vm";

import { transformSync } from "@swc/core";

const baseConfig = jest.requireActual("../../jest.base.conf.js");
const ROOT = resolve(__dirname, "../..");

function compileModule(relativePath: string, source: string) {
  const filename = join(ROOT, relativePath);
  // The JavaScript config exposes untyped entries; these options go to SWC.
  const transform = Object.entries(baseConfig.transform).find(([pattern]) =>
    new RegExp(pattern).test(filename),
  )?.[1] as [string, Parameters<typeof transformSync>[1]] | undefined;
  if (!transform) {
    throw new Error(`No Jest transform configured for ${filename}`);
  }
  const [, options] = transform;
  const result = transformSync(source, { ...options, filename });
  const exports: Record<string, unknown> = {};
  const load = jest.fn((name: string) => {
    if (name === "./unused") {
      throw new Error("Unused dependency should not execute");
    }
    return { value: 42 };
  });
  runInNewContext(result.code, { exports, require: load });
  return { exports, load };
}

describe("Jest module loading", () => {
  it.each([
    "frontend/test/__mocks__/locales/ko.json",
    "frontend/src/metabase/query_builder/tests/fixture.json",
    "frontend/src/metabase/query_builder/tests/styles.css",
  ])("does not transform non-script fixtures in %s", (path) => {
    const filename = join(ROOT, path);
    expect(
      Object.keys(baseConfig.transform).some((pattern) =>
        new RegExp(pattern).test(filename),
      ),
    ).toBe(false);
  });

  it.each([
    "frontend/src/metabase/query_builder/test-module.ts",
    "frontend/src/metabase-lib/test-module.ts",
    "frontend/src/metabase-types/test-module.ts",
    "enterprise/frontend/src/metabase-enterprise/test-module.ts",
  ])("does not execute unused relative re-exports in %s", (path) => {
    const { exports, load } = compileModule(
      path,
      'export { value } from "./used"; export { unused } from "./unused";',
    );

    expect(load).not.toHaveBeenCalled();
    expect(exports.value).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("./used");
  });

  it("still executes explicit side-effect imports immediately", () => {
    const { exports, load } = compileModule(
      "frontend/src/metabase/query_builder/test-module.ts",
      'import "./register"; export { value } from "./used";',
    );

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("./register");
    expect(exports.value).toBe(42);
  });

  it.each(["current-user", "settings"])(
    "eagerly executes %s endpoint registration even when no export is read",
    (moduleName) => {
      const { load } = compileModule(
        `frontend/src/metabase/${moduleName}/index.ts`,
        'export { value } from "./api";',
      );

      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith("./api");
    },
  );

  it.each([
    "frontend/src/metabase/query_builder/test-module.unit.spec.ts",
    "frontend/src/metabase/query_builder/setup.spec.tsx",
    "frontend/src/metabase/query_builder/tests/setup.tsx",
    "frontend/src/metabase/query_builder/__support__/setup.ts",
    "frontend/src/metabase/query_builder/__mocks__/setup.ts",
    "frontend/src/metabase/query_builder/test-utils.tsx",
    "frontend/test/__support__/test-module.ts",
    "node_modules/d3-array/src/test-module.js",
    "enterprise/frontend/src/custom-viz/src/test-module.ts",
    "frontend/src/embedding-sdk-bundle/test-module.ts",
  ])("preserves eager relative imports in %s", (path) => {
    const { load } = compileModule(path, 'export { value } from "./used";');

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("./used");
  });
});
