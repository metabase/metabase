import { RuleTester } from "eslint";

import rule from "../eslint-plugin-metabase/rules/enforce-module-public-api";
import { getPublicApiModules } from "../module-boundaries.mjs";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const options = [{ modules: ["metabase/analytics"] }];

const OUTSIDE_FILE = "/repo/frontend/src/metabase/admin/some-file.ts";
const INSIDE_FILE = "/repo/frontend/src/metabase/analytics/event.ts";

ruleTester.run("enforce-module-public-api", rule, {
  valid: [
    {
      name: "outside files import the module index",
      code: `import { trackSimpleEvent } from "metabase/analytics";`,
      filename: OUTSIDE_FILE,
      options,
    },
    {
      name: "module files import relatively",
      code: `import { createSnowplowTracker } from "./snowplow";`,
      filename: INSIDE_FILE,
      options,
    },
    {
      name: "unrelated deep imports are not the rule's business",
      code: `import { useToast } from "metabase/common/hooks/use-toast";`,
      filename: OUTSIDE_FILE,
      options,
    },
    {
      name: "an alias sharing the module prefix is not the module",
      code: `import { x } from "metabase/analytics-page/util";`,
      filename: OUTSIDE_FILE,
      options,
    },
    {
      name: "no flagged modules, no checks",
      code: `import { trackSchemaEvent } from "metabase/analytics/event";`,
      filename: OUTSIDE_FILE,
      options: [{ modules: [] }],
    },
  ],
  invalid: [
    {
      name: "outside files must not deep-import module files",
      code: `import { trackSchemaEvent } from "metabase/analytics/event";`,
      filename: OUTSIDE_FILE,
      options,
      errors: [{ messageId: "useModuleIndex" }],
    },
    {
      name: "re-exports count as imports",
      code: `export * from "metabase/analytics/event";`,
      filename: OUTSIDE_FILE,
      options,
      errors: [{ messageId: "useModuleIndex" }],
    },
    {
      name: "dynamic imports count as imports",
      code: `const load = () => import("metabase/analytics/snowplow");`,
      filename: OUTSIDE_FILE,
      options,
      errors: [{ messageId: "useModuleIndex" }],
    },
    {
      name: "module files must not deep-import via their own alias",
      code: `import { trackPageView } from "metabase/analytics/page-view";`,
      filename: INSIDE_FILE,
      options,
      errors: [{ messageId: "useRelativeImport" }],
    },
    {
      name: "module files must not import their own index (self-cycle)",
      code: `import { trackSimpleEvent } from "metabase/analytics";`,
      filename: INSIDE_FILE,
      options,
      errors: [{ messageId: "useRelativeImport" }],
    },
  ],
});

// Parent-first on purpose: resolution must not depend on option order.
const nestedOptions = [
  { modules: ["metabase/admin", "metabase/admin/performance"] },
];
const NESTED_CHILD_FILE =
  "/repo/frontend/src/metabase/admin/performance/StrategyForm.ts";
// OUTSIDE_FILE sits inside `metabase/admin`, so the nested cases need a file outside both modules.
const NESTED_OUTSIDE_FILE = "/repo/frontend/src/metabase/home/some-file.ts";

ruleTester.run("enforce-module-public-api nested modules", rule, {
  valid: [
    {
      name: "the child's index is the child's interface, not a parent deep import",
      code: `import { StrategyForm } from "metabase/admin/performance";`,
      filename: NESTED_OUTSIDE_FILE,
      options: nestedOptions,
    },
    {
      name: "child files may import the parent's index",
      code: `import { getAdminPaths } from "metabase/admin";`,
      filename: NESTED_CHILD_FILE,
      options: nestedOptions,
    },
  ],
  invalid: [
    {
      name: "deep imports of the child are attributed to the child",
      code: `import { x } from "metabase/admin/performance/utils";`,
      filename: NESTED_OUTSIDE_FILE,
      options: nestedOptions,
      errors: [
        {
          messageId: "useModuleIndex",
          data: { alias: "metabase/admin/performance" },
        },
      ],
    },
    {
      name: "deep imports of the parent are attributed to the parent",
      code: `import { x } from "metabase/admin/utils";`,
      filename: NESTED_OUTSIDE_FILE,
      options: nestedOptions,
      errors: [
        { messageId: "useModuleIndex", data: { alias: "metabase/admin" } },
      ],
    },
    {
      name: "child files must not import their own index",
      code: `import { StrategyForm } from "metabase/admin/performance";`,
      filename: NESTED_CHILD_FILE,
      options: nestedOptions,
      errors: [
        {
          messageId: "useRelativeImport",
          data: { alias: "metabase/admin/performance" },
        },
      ],
    },
  ],
});

describe("getPublicApiModules", () => {
  it("returns the aliases of flagged elements only", () => {
    expect(
      getPublicApiModules([
        {
          type: "lib",
          pattern: "frontend/src/metabase/flagged/**",
          publicApiAlias: "metabase/flagged",
        },
        { type: "shared", pattern: "frontend/src/metabase/unflagged/**" },
      ]),
    ).toEqual(["metabase/flagged"]);
  });
});
