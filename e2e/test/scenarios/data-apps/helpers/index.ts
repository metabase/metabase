import {
  ORDERS_COUNT_QUESTION_ENTITY_ID,
  ORDERS_QUESTION_ENTITY_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { DataAppTestEnv } from "e2e/support/helpers";

/** The `testEnv` the fixture's Overview page reads (Orders count + question). */
export const DATA_APP_TEST_ENV: DataAppTestEnv = {
  scalarQuery: {
    source: { type: "card", entityId: ORDERS_COUNT_QUESTION_ENTITY_ID },
  },
  questionQuery: {
    source: { type: "card", entityId: ORDERS_QUESTION_ENTITY_ID },
  },
};
