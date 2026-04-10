import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";

import rule from "../eslint-plugin-metabase/rules/no-analytics-import-outside-analytics-files";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    sourceType: "module",
  },
});

const VALID_CASES = [
  {
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/analytics.ts",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/analytics.tsx",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/analytics.js",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/analytics.jsx",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "frontend/src/metabase/dashboard/analytics.ts",
  },
  {
    code: `import { someOtherFunction } from "metabase/utils/other";`,
    filename: "/path/to/Component.tsx",
  },
  {
    code: `import React from "react";`,
    filename: "/path/to/Component.tsx",
  },
];

const errorMessage = /are only allowed in files named "analytics"/;

const INVALID_CASES = [
  {
    name: "Detect import in non-analytics .tsx file",
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/Component.tsx",
    error: errorMessage,
  },
  {
    name: "Detect import in non-analytics .ts file",
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/utils.ts",
    error: errorMessage,
  },
  {
    name: "Detect type import in non-analytics .ts file",
    code: `import type { SchemaType } from "metabase/utils/analytics";`,
    filename: "/path/to/utils.ts",
    error: errorMessage,
  },
  {
    name: "Detect import in non-analytics .js file",
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/helper.js",
    error: errorMessage,
  },
  {
    name: "Detect import in non-analytics .jsx file",
    code: `import { trackSchemaEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/Component.jsx",
    error: errorMessage,
  },
  {
    name: "Detect multiple imports from analytics",
    code: `import { trackSchemaEvent, trackSimpleEvent } from "metabase/utils/analytics";`,
    filename: "/path/to/DashCard.tsx",
    error: errorMessage,
  },
  {
    name: "Detect default import from analytics",
    code: `import analytics from "metabase/utils/analytics";`,
    filename: "/path/to/Component.tsx",
    error: errorMessage,
  },
];

ruleTester.run("no-analytics-import-outside-analytics-files", rule, {
  valid: VALID_CASES,
  invalid: INVALID_CASES.map((invalidCase) => {
    return {
      code: invalidCase.code,
      filename: invalidCase.filename,
      errors: [
        {
          message: invalidCase.error,
        },
      ],
    };
  }),
});
