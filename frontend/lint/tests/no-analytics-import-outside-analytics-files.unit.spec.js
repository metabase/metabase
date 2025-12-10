import { RuleTester } from "eslint";

import noAnalyticsImportOutsideAnalyticsFiles from "../eslint-rules/no-analytics-import-outside-analytics-files";

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2015,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
});

const VALID_CASES = [
  {
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/analytics.ts",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/analytics.tsx",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/analytics.js",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/analytics.jsx",
  },
  {
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "frontend/src/metabase/dashboard/analytics.ts",
  },
  {
    code: `import { someOtherFunction } from "metabase/lib/other";`,
    filename: "/path/to/Component.tsx",
  },
  {
    code: `import React from "react";`,
    filename: "/path/to/Component.tsx",
  },
];

const INVALID_CASES = [
  {
    name: "Detect import in non-analytics .tsx file",
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/Component.tsx",
    error:
      /Imports from "metabase\/lib\/analytics" are only allowed in files named "analytics\.ts", "analytics\.tsx", "analytics\.js", or "analytics\.jsx"\. Please move this import to an analytics file\./,
  },
  {
    name: "Detect import in non-analytics .ts file",
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/utils.ts",
    error:
      /Imports from "metabase\/lib\/analytics" are only allowed in files named "analytics\.ts", "analytics\.tsx", "analytics\.js", or "analytics\.jsx"\. Please move this import to an analytics file\./,
  },
  {
    name: "Detect import in non-analytics .js file",
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/helper.js",
    error:
      /Imports from "metabase\/lib\/analytics" are only allowed in files named "analytics\.ts", "analytics\.tsx", "analytics\.js", or "analytics\.jsx"\. Please move this import to an analytics file\./,
  },
  {
    name: "Detect import in non-analytics .jsx file",
    code: `import { trackSchemaEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/Component.jsx",
    error:
      /Imports from "metabase\/lib\/analytics" are only allowed in files named "analytics\.ts", "analytics\.tsx", "analytics\.js", or "analytics\.jsx"\. Please move this import to an analytics file\./,
  },
  {
    name: "Detect multiple imports from analytics",
    code: `import { trackSchemaEvent, trackSimpleEvent } from "metabase/lib/analytics";`,
    filename: "/path/to/DashCard.tsx",
    error:
      /Imports from "metabase\/lib\/analytics" are only allowed in files named "analytics\.ts", "analytics\.tsx", "analytics\.js", or "analytics\.jsx"\. Please move this import to an analytics file\./,
  },
  {
    name: "Detect default import from analytics",
    code: `import analytics from "metabase/lib/analytics";`,
    filename: "/path/to/Component.tsx",
    error:
      /Imports from "metabase\/lib\/analytics" are only allowed in files named "analytics\.ts", "analytics\.tsx", "analytics\.js", or "analytics\.jsx"\. Please move this import to an analytics file\./,
  },
];

ruleTester.run(
  "no-analytics-import-outside-analytics-files",
  noAnalyticsImportOutsideAnalyticsFiles,
  {
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
  },
);
