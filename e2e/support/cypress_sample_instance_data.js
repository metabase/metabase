/**
 *  This JSON file gets recreated every time Cypress starts.
 *  See: `e2e/snapshot-creators/default.cy.snap.js:19`
 *
 *  - It had to be added to `.gitignore`.
 *  - It contains extracted metadata from the default instance state (like question and dashboard ids)
 */

import _ from "underscore";

// eslint-disable-next-line import/no-unresolved
import SAMPLE_INSTANCE_DATA from "./cypress_sample_instance_data.json";

export const ORDERS_QUESTION_ID = _.findWhere(SAMPLE_INSTANCE_DATA.questions, {
  name: "Orders",
}).id;

export const ORDERS_COUNT_QUESTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.questions,
  { name: "Orders, Count" },
).id;

export const ORDERS_BY_YEAR_QUESTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.questions,
  { name: "Orders, Count, Grouped by Created At (year)" },
).id;

export const ADMIN_PERSONAL_COLLECTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.collections,
  { name: "Bobby Tables's Personal Collection" },
).id;
