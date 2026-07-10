import type { DataAppTestEnv } from "e2e/support/assets/data-apps/renders-interactive-question/src/test-env";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

// These live here (co-located with the specs) rather than in
// `e2e/support/helpers/e2e-data-app-helpers.ts`: that file is part of the
// Cypress support bundle, and importing `cypress_sample_database` there would
// pull the git-ignored `cypress_sample_database.json` into the snapshot-creation
// build — before that file is generated. Specs are bundled only after it exists.

const { ORDERS_ID } = SAMPLE_DATABASE;

/**
 * A raw numeric field dimension for the query-builder combinators, shaped like a
 * generated `metabase.data.ts` schema entry.
 */
export const dataAppNumericField = (fieldId: number, name: string) => ({
  type: "column" as const,
  fieldId,
  tableId: ORDERS_ID,
  name,
  jsType: "number" as const,
});

const source = { type: "table" as const, id: ORDERS_ID };

/** The `testEnv` the fixture's Overview page reads (Orders count + question). */
export const DATA_APP_TEST_ENV: DataAppTestEnv = {
  scalarQuery: {
    source,
    aggregations: [{ type: "operator", operator: "count", args: [] }],
  },
  questionQuery: { source },
};
