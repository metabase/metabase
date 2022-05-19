/**
 * We are keeping the references to most commonly used ids and objects in this file.
 *
 * Please note that these ids are hard coded and might change if sample database changes in the future!
 * For that reason, we have some sanity checks in the `default.cy.snap.js` spec.
 *
 * SAMPLE_DB_TABLES contains only the references to the four main tables ids in sample database.
 * We need these references to avoid circular dependecy issue in custom commands and e2e helpers.
 * That is the only place they should be used. NEVER use them in tests!
 *
 * USER_GROUPS
 * Although they are also hard coded, the assertions are put in place in the default snapshot generator
 * that would break if the actual ids change. Unlike SAMPLE_DB_TABLES which depend on the order of SQL
 * commands used to create the sample database, USER_GROUPS depend on the order in which we create new user groups.
 *
 * As a general note, whenever you add a new reference to this file, please make sure there is a trigger somewhere
 * that would break and alert us if expected and actual values don't match.
 */

export const SAMPLE_DB_ID = 1;

// Use only for e2e helpers and custom commands. Never in e2e tests directly!
export const SAMPLE_DB_TABLES = {
  STATIC_PRODUCTS_ID: 1,
  STATIC_ORDERS_ID: 2,
  STATIC_PEOPLE_ID: 3,
  STATIC_REVIEWS_ID: 4,
};

// All users and admin groups are the defaults that come with Metabase.
// The rest are the ones we choose the name and the order for.
export const USER_GROUPS = {
  ALL_USERS_GROUP: 1,
  ADMIN_GROUP: 2,
  COLLECTION_GROUP: 3,
  DATA_GROUP: 4,
  READONLY_GROUP: 5,
  NOSQL_GROUP: 6,
};

const {
  ALL_USERS_GROUP,
  COLLECTION_GROUP,
  DATA_GROUP,
  READONLY_GROUP,
  NOSQL_GROUP,
} = USER_GROUPS;

export const USERS = {
  // All around access
  admin: {
    first_name: "Bobby",
    last_name: "Tables",
    email: "admin@metabase.test",
    password: "12341234",
  },
  normal: {
    first_name: "Robert",
    last_name: "Tableton",
    email: "normal@metabase.test",
    password: "12341234",
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
      { id: DATA_GROUP, is_group_manager: false },
    ],
  },
  // Collection-related users that don't have access to data at all
  nodata: {
    first_name: "No Data",
    last_name: "Tableton",
    email: "nodata@metabase.test",
    password: "12341234",
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ],
  },
  sandboxed: {
    first_name: "User",
    last_name: "1",
    email: "u1@metabase.test",
    password: "12341234",
    login_attributes: {
      attr_uid: "1",
      attr_cat: "Widget",
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ],
  },
  readonly: {
    first_name: "Read Only",
    last_name: "Tableton",
    email: "readonly@metabase.test",
    password: "12341234",
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: READONLY_GROUP, is_group_manager: false },
    ],
  },
  // Users with access to data, but no access to collections
  nocollection: {
    first_name: "No Collection",
    last_name: "Tableton",
    email: "nocollection@metabase.test",
    password: "12341234",
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: DATA_GROUP, is_group_manager: false },
    ],
  },
  nosql: {
    first_name: "No SQL",
    last_name: "Tableton",
    email: "nosql@metabase.test",
    password: "12341234",
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: NOSQL_GROUP, is_group_manager: false },
    ],
  },
  // No access at all
  none: {
    first_name: "None",
    last_name: "Tableton",
    email: "none@metabase.test",
    password: "12341234",
    user_group_memberships: [{ id: ALL_USERS_GROUP, is_group_manager: false }],
  },
};

// Embedding
export const METABASE_SECRET_KEY =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
