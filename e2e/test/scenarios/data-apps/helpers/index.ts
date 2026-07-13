import type { LocalFieldReference } from "@metabase/embedding-sdk-react/data-app";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { DataAppTestEnv } from "e2e/support/helpers";

// These live here (co-located with the specs) rather than in
// `e2e/support/helpers/e2e-data-app-helpers.ts`: that file is part of the
// Cypress support bundle, and importing `cypress_sample_database` there would
// pull the git-ignored `cypress_sample_database.json` into the snapshot-creation
// build — before that file is generated. Specs are bundled only after it exists.

const { ORDERS_ID } = SAMPLE_DATABASE;

/**
 * A numeric field dimension for the query-builder combinators, hand-built the way
 * an app without a generated `metabase.data.ts` schema would build one.
 */
export const dataAppNumericField = (
  fieldId: number,
  name: string,
): LocalFieldReference => ({
  type: "column",
  fieldId,
  tableId: ORDERS_ID,
  name,
  jsType: "number",
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
