import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { DataAppTestEnv } from "e2e/support/helpers";

// These live here (co-located with the specs) rather than in
// `e2e/support/helpers/e2e-data-app-helpers.ts`: that file is part of the
// Cypress support bundle, and importing `cypress_sample_database` there would
// pull the git-ignored `cypress_sample_database.json` into the snapshot-creation
// build — before that file is generated. Specs are bundled only after it exists.

const { ORDERS_ID } = SAMPLE_DATABASE;

const source = { type: "table" as const, id: ORDERS_ID };

/**
 * The `testEnv` the fixture's Overview page reads (Orders count + question).
 *
 * Both carry a `savedQuestionSourceId`, because a deployed app runs the card its
 * query was published as — a bare table source is refused. Each id names a
 * snapshot question equivalent to the authored query, since the swap drops the
 * static clauses the card already contains.
 */
export const DATA_APP_TEST_ENV: DataAppTestEnv = {
  scalarQuery: {
    source,
    aggregations: [{ type: "operator", operator: "count", args: [] }],
    savedQuestionSourceId: ORDERS_COUNT_QUESTION_ID,
  },
  questionQuery: { source, savedQuestionSourceId: ORDERS_QUESTION_ID },
};
