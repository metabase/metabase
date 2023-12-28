import { ORDERS_PRODUCTS_ACCESS } from "./test_roles";

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
export const SAMPLE_DB_SCHEMA_ID = "1:PUBLIC";

// Use only for e2e helpers and custom commands. Never in e2e tests directly!
export const SAMPLE_DB_TABLES = {
  // old tables
  STATIC_PRODUCTS_ID: 8,
  STATIC_ORDERS_ID: 5,
  STATIC_PEOPLE_ID: 3,
  STATIC_REVIEWS_ID: 4,
  // new tables
  STATIC_ACCOUNTS_ID: 6,
  STATIC_ANALYTIC_EVENTS_ID: 1,
  STATIC_FEEDBACK_ID: 2,
  STATIC_INVOICES_ID: 7,
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
  impersonated: {
    first_name: "User",
    last_name: "Impersonated",
    email: "impersonated@metabase.test",
    password: "12341234",
    login_attributes: {
      role: ORDERS_PRODUCTS_ACCESS,
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ],
  },
};

// Embedding
export const METABASE_SECRET_KEY =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

// QA DATABASES
// https://github.com/metabase/metabase-qa
export const QA_MYSQL_PORT = 3304;
export const QA_MONGO_PORT = 27004;
export const QA_POSTGRES_PORT = 5404;

export const QA_DB_CREDENTIALS = {
  host: "localhost",
  user: "metabase",
  password: "metasample123",
  database: "sample",
  ssl: false,
};

export const QA_DB_CONFIG = {
  mysql: {
    client: "mysql2",
    connection: {
      ...QA_DB_CREDENTIALS,
      port: QA_MYSQL_PORT,
      multipleStatements: true,
    },
  },
  postgres: {
    client: "pg",
    connection: {
      ...QA_DB_CREDENTIALS,
      port: QA_POSTGRES_PORT,
    },
  },
};

export const WRITABLE_DB_ID = 2;

export const WRITABLE_DB_CONFIG = {
  mysql: {
    client: "mysql2",
    connection: {
      ...QA_DB_CREDENTIALS,
      user: "root", // only the root user has create database privileges
      database: "writable_db",
      port: QA_MYSQL_PORT,
      multipleStatements: true,
    },
  },
  postgres: {
    client: "pg",
    connection: {
      ...QA_DB_CREDENTIALS,
      database: "writable_db",
      port: QA_POSTGRES_PORT,
    },
  },
};

export const WEBMAIL_CONFIG = {
  WEB_PORT: 1080,
  SMTP_PORT: 1025,
};
