import { createLazyModule } from "metabase/utils/lazy-module";

/**
 * Third-party libraries loaded on first use instead of with the main bundle.
 *
 * Define them here rather than next to their callers: the unit test setup imports
 * this file and preloads every module in it before each test.
 */

/** CSV parser for pasting several values into a multi-value input. */
export const csvParseLibrary = createLazyModule(
  () => import("csv-parse/browser/esm/sync"),
);

/** Markdown lexer for splitting Metabot messages into blocks. */
export const markedLibrary = createLazyModule(() => import("marked"));

/** Explains and validates cron expressions in schedule UIs. */
export const cronLibraries = createLazyModule(() =>
  Promise.all([import("cronstrue"), import("cron-expression-validator")]).then(
    ([cronstrue, validator]) => ({
      cronstrue: cronstrue.default,
      isValidCronExpression: validator.isValidCronExpression,
    }),
  ),
);
