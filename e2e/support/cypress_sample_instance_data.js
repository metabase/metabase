/**
 *  This JSON file gets recreated every time Cypress starts.
 *  See: `e2e/snapshot-creators/default.cy.snap.js:19`
 *
 *  - It had to be added to `.gitignore`.
 *  - It contains extracted metadata from the default instance state (like question and dashboard ids)
 */

import _ from "underscore";

import SAMPLE_INSTANCE_DATA from "./cypress_sample_instance_data.json";

export const ORDERS_QUESTION_ID = _.findWhere(SAMPLE_INSTANCE_DATA.questions, {
  name: "Orders",
}).id;

export const ORDERS_MODEL_ID = _.findWhere(SAMPLE_INSTANCE_DATA.questions, {
  name: "Orders Model",
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

export const NORMAL_PERSONAL_COLLECTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.collections,
  { name: "Robert Tableton's Personal Collection" },
).id;

export const READ_ONLY_PERSONAL_COLLECTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.collections,
  { name: "Read Only Tableton's Personal Collection" },
).id;

export const NO_DATA_PERSONAL_COLLECTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.collections,
  { name: "No Data Tableton's Personal Collection" },
).id;

export const NO_COLLECTION_PERSONAL_COLLECTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.collections,
  { name: "No Collection Tableton's Personal Collection" },
).id;

export const FIRST_COLLECTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.collections,
  { name: "First collection" },
).id;

/**
 * @type number
 */
export const SECOND_COLLECTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.collections,
  { name: "Second collection" },
).id;

export const THIRD_COLLECTION_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.collections,
  { name: "Third collection" },
).id;

export const ORDERS_DASHBOARD_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.dashboards,
  { name: "Orders in a dashboard" },
).id;

export const ORDERS_DASHBOARD_DASHCARD_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.dashboards,
  { name: "Orders in a dashboard" },
).dashcards[0].id;

export const ADMIN_USER_ID = _.findWhere(SAMPLE_INSTANCE_DATA.users, {
  email: "admin@metabase.test",
}).id;

export const NORMAL_USER_ID = _.findWhere(SAMPLE_INSTANCE_DATA.users, {
  email: "normal@metabase.test",
}).id;

export const NODATA_USER_ID = _.findWhere(SAMPLE_INSTANCE_DATA.users, {
  email: "nodata@metabase.test",
}).id;

export const ADMINISTRATORS_GROUP_ID = _.findWhere(
  SAMPLE_INSTANCE_DATA.groups,
  { name: "Administrators" },
).id;

export const ALL_USERS_GROUP_ID = _.findWhere(SAMPLE_INSTANCE_DATA.groups, {
  name: "All Users",
}).id;

export const COLLECTION_GROUP_ID = _.findWhere(SAMPLE_INSTANCE_DATA.groups, {
  name: "collection",
}).id;

export const DATA_GROUP_ID = _.findWhere(SAMPLE_INSTANCE_DATA.groups, {
  name: "data",
}).id;

export const NOSQL_GROUP_ID = _.findWhere(SAMPLE_INSTANCE_DATA.groups, {
  name: "nosql",
}).id;

export const READONLY_GROUP_ID = _.findWhere(SAMPLE_INSTANCE_DATA.groups, {
  name: "readonly",
}).id;
