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
