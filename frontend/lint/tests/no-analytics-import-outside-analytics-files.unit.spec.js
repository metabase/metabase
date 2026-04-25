import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";

import rule from "../eslint-plugin-metabase/rules/no-analytics-import-outside-analytics-files";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    sourceType: "module",
  },
});

const errorMessage = /is only allowed in files named "analytics"/;

const VALID_CASES = [
  // Non-restricted specifiers may be imported from the barrel anywhere.
  {
    code: `import { createSnowplowTracker } from "metabase/analytics";`,
    filename: "/path/to/app.js",
  },
  {
    code: `import { trackPageView } from "metabase/analytics";`,
    filename: "/path/to/routes.jsx",
  },
  // Restricted specifiers are fine in analytics.* files.
  {
    code: `import { trackSchemaEvent } from "metabase/analytics";`,
    filename: "/path/to/analytics.ts",
  },
  {
    code: `import { trackSimpleEvent } from "metabase/analytics";`,
    filename: "/path/to/analytics.tsx",
  },
  {
    code: `import { trackSchemaEvent, trackSimpleEvent } from "metabase/analytics";`,
    filename: "frontend/src/metabase/dashboard/analytics.ts",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/analytics";`,
    filename: "/path/to/analytics.js",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/analytics";`,
    filename: "/path/to/analytics.jsx",
  },
  // Imports of other modules are unaffected.
  {
    code: `import { someOtherFunction } from "metabase/utils/other";`,
    filename: "/path/to/Component.tsx",
  },
  {
    code: `import React from "react";`,
    filename: "/path/to/Component.tsx",
  },
];

const INVALID_CASES = [
  {
    name: "trackSchemaEvent in component",
    code: `import { trackSchemaEvent } from "metabase/analytics";`,
    filename: "/path/to/Component.tsx",
    errors: [{ message: errorMessage }],
  },
  {
    name: "trackSimpleEvent in component",
    code: `import { trackSimpleEvent } from "metabase/analytics";`,
    filename: "/path/to/Component.tsx",
    errors: [{ message: errorMessage }],
  },
  {
    name: "trackSchemaEvent in utils.ts",
    code: `import { trackSchemaEvent } from "metabase/analytics";`,
    filename: "/path/to/utils.ts",
    errors: [{ message: errorMessage }],
  },
  {
    name: "trackSchemaEvent in helper.js",
    code: `import { trackSchemaEvent } from "metabase/analytics";`,
    filename: "/path/to/helper.js",
    errors: [{ message: errorMessage }],
  },
  {
    name: "trackSchemaEvent in Component.jsx",
    code: `import { trackSchemaEvent } from "metabase/analytics";`,
    filename: "/path/to/Component.jsx",
    errors: [{ message: errorMessage }],
  },
  {
    name: "multiple restricted specifiers flagged individually",
    code: `import { trackSchemaEvent, trackSimpleEvent } from "metabase/analytics";`,
    filename: "/path/to/DashCard.tsx",
    errors: [{ message: errorMessage }, { message: errorMessage }],
  },
  {
    name: "allowed + restricted mixed — only restricted flagged",
    code: `import { createSnowplowTracker, trackSchemaEvent } from "metabase/analytics";`,
    filename: "/path/to/Component.tsx",
    errors: [{ message: errorMessage }],
  },
];

ruleTester.run("no-analytics-import-outside-analytics-files", rule, {
  valid: VALID_CASES,
  invalid: INVALID_CASES.map(({ code, filename, errors }) => ({
    code,
    filename,
    errors,
  })),
});
