#!/usr/bin/env node

/* eslint-disable no-console */
// metabaseSeed.js
import { writeFileSync } from "fs";
import { dirname, resolve } from "path";

import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { api, createMetabaseClient } from "./api";
import { USERS } from "./cypress_data";
import { connectAndQueryDB } from "./db_tasks";
const basePort = process.env.MB_JETTY_PORT || 4000;
const baseUrl = `http://localhost:${basePort}`;
const SAMPLE_DB_ID = 1;
const ALL_USERS_GROUP_ID = 1;
const ADMIN_GROUP_ID = 2;

export async function getSession() {
  const props = await api("/api/session/properties", { baseUrl });
  return props;
}

export async function getSetupToken() {
  const props = await api("/api/session/properties", { baseUrl });
  return props["setup-token"];
}

/**
 * Creates a first (admin) user and returns the API key.
 */
async function initializeInstance() {
  const setupToken = await getSetupToken();
  const { id: sessionToken } = await api("/api/setup", {
    method: "POST",
    body: {
      token: setupToken,
      user: USERS.admin,
      prefs: {
        site_name: "Epic Team",
        allow_tracking: false,
      },
      database: null,
    },
    baseUrl,
  });

  const client = createMetabaseClient({ baseUrl, sessionToken });

  const { id: adminId } = await client.get("/api/user/current");
  await client.put(`/api/user/${adminId}/modal/qbnewb`);

  const { unmasked_key: adminApiKey } = await client.post("/api/api-key", {
    group_id: ADMIN_GROUP_ID,
    name: "Admin API key",
  });

  return adminApiKey;
}

const METABASE_SECRET_KEY =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

async function snapshot(name) {
  await api(`/api/testing/snapshot/${name}`, {
    method: "POST",
    baseUrl,
  });

  console.log(`✅ Created a DB snapshot "${name}"`);
}

export async function seed() {
  try {
    await snapshot("blank");
    const API_KEY = await initializeInstance();
    const client = createMetabaseClient({ baseUrl, API_KEY });

    const updateSetting = async (setting, value) => {
      await client.put(`/api/setting/${setting}`, {
        value,
      });
      console.log(`✅ Setting ${setting} updated with value ${value} `);
    };

    await updateSetting("synchronous-batch-updates", true);
    await updateSetting("enable-public-sharing", true);
    await updateSetting("enable-embedding-sdk", true);
    await updateSetting("enable-embedding-static", true);
    await updateSetting("embedding-secret-key", METABASE_SECRET_KEY);
    await updateSetting(
      "license-token-missing-banner-dismissal-timestamp",
      new Date().toISOString(),
    );

    await snapshot("setup");

    const { id: COLLECTION_GROUP_ID } = await client.post(
      "/api/permissions/group",
      { name: "collection" },
    );
    const { id: DATA_GROUP_ID } = await client.post("/api/permissions/group", {
      name: "data",
    });
    const { id: READONLY_GROUP_ID } = await client.post(
      "/api/permissions/group",
      { name: "readonly" },
    );
    const { id: NOSQL_GROUP_ID } = await client.post("/api/permissions/group", {
      name: "nosql",
    });

    const USERS = {
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
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
          { id: COLLECTION_GROUP_ID, is_group_manager: false },
          { id: DATA_GROUP_ID, is_group_manager: false },
        ],
      },
      // Collection-related users that don't have access to data at all
      nodata: {
        first_name: "No Data",
        last_name: "Tableton",
        email: "nodata@metabase.test",
        password: "12341234",
        user_group_memberships: [
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
          { id: COLLECTION_GROUP_ID, is_group_manager: false },
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
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
          { id: COLLECTION_GROUP_ID, is_group_manager: false },
        ],
      },
      readonly: {
        first_name: "Read Only",
        last_name: "Tableton",
        email: "readonly@metabase.test",
        password: "12341234",
        user_group_memberships: [
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
          { id: READONLY_GROUP_ID, is_group_manager: false },
        ],
      },
      readonlynosql: {
        first_name: "Read Only Data No Sql",
        last_name: "Tableton",
        email: "readonlynosql@metabase.test",
        password: "12341234",
        user_group_memberships: [
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
          { id: READONLY_GROUP_ID, is_group_manager: false },
          { id: NOSQL_GROUP_ID, is_group_manager: false },
        ],
      },
      // Users with access to data, but no access to collections
      nocollection: {
        first_name: "No Collection",
        last_name: "Tableton",
        email: "nocollection@metabase.test",
        password: "12341234",
        user_group_memberships: [
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
          { id: DATA_GROUP_ID, is_group_manager: false },
        ],
      },
      nosql: {
        first_name: "No SQL",
        last_name: "Tableton",
        email: "nosql@metabase.test",
        password: "12341234",
        user_group_memberships: [
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
          { id: NOSQL_GROUP_ID, is_group_manager: false },
        ],
      },
      // No access at all
      none: {
        first_name: "None",
        last_name: "Tableton",
        email: "none@metabase.test",
        password: "12341234",
        user_group_memberships: [
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
        ],
      },
      impersonated: {
        first_name: "User",
        last_name: "Impersonated",
        email: "impersonated@metabase.test",
        password: "12341234",
        login_attributes: {
          role: "orders_products_access",
        },
        user_group_memberships: [
          { id: ALL_USERS_GROUP_ID, is_group_manager: false },
          { id: COLLECTION_GROUP_ID, is_group_manager: false },
        ],
      },
    };

    const createUser = async (user) => {
      const { id } = await client.post("/api/user", USERS[user]);
      await client.put(`/api/user/${id}/modal/qbnewb`);
    };

    // Create all users except admin, who was already created in one of the previous steps
    await createUser("normal");
    await createUser("nodata");
    await createUser("sandboxed");
    await createUser("readonly");
    await createUser("readonlynosql");
    await createUser("nocollection");
    await createUser("nosql");
    await createUser("none");
    await createUser("impersonated");

    await client.get("/api/user");

    const updatedPermissions = {
      [ALL_USERS_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          // set the data permission so the UI doesn't warn us that "all users has higher permissions than X"
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
      [DATA_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
      [NOSQL_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
      [COLLECTION_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
      [READONLY_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
    };

    const { groups: permissionsGroups, revision: premissionsRevision } =
      await client.get("/api/permissions/graph");

    await client.put("/api/permissions/graph", {
      groups: { ...permissionsGroups, ...updatedPermissions },
      revision: premissionsRevision,
    });

    const updatedCollectionPermissions = {
      [ALL_USERS_GROUP_ID]: { root: "none" },
      [DATA_GROUP_ID]: { root: "none" },
      [NOSQL_GROUP_ID]: { root: "none" },
      [COLLECTION_GROUP_ID]: { root: "write" },
      [READONLY_GROUP_ID]: { root: "read" },
    };

    const { groups: collectionGroups, revision: collectionRevision } =
      await client.get("/api/collection/graph");

    await client.put("/api/collection/graph", {
      groups: { ...collectionGroups, ...updatedCollectionPermissions },
      revision: collectionRevision,
    });

    const { id: firstCollectionId } = await client.post("/api/collection", {
      name: "First collection",
      description: "Collection First collection",
    });
    const { id: secondCollectionId } = await client.post("/api/collection", {
      name: "Second collection",
      description: "Collection Second collection",
      parent_id: firstCollectionId,
    });
    await client.post("/api/collection", {
      name: "Third collection",
      description: "Collection Third collection",
      parent_id: secondCollectionId,
    });

    const getSampleDatabase = async () => {
      const metadata = await client.get(
        `/api/database/${SAMPLE_DB_ID}/metadata?include_hidden=true`,
      );

      const database = {};

      for (const table of metadata.tables ?? []) {
        const fields = {};

        for (const field of table.fields ?? []) {
          if (typeof field.id !== "number") {
            throw new Error(
              "Sanity check: raw db table field ids should always be numbers",
            );
          }

          fields[field.name.toUpperCase()] = field.id;
        }

        database[table.name.toUpperCase()] = fields;
        Object.assign(database, {
          [`${table.name.toUpperCase()}_ID`]: table.id,
        });
      }

      return database;
    };

    const SAMPLE_DATABASE = await getSampleDatabase();

    const {
      ORDERS,
      ORDERS_ID,
      ACCOUNTS_ID,
      ANALYTIC_EVENTS_ID,
      FEEDBACK_ID,
      INVOICES_ID,
    } = SAMPLE_DATABASE;

    await client.put(`/api/table/${ACCOUNTS_ID}`, {
      visibility_type: "hidden",
    });
    await client.put(`/api/table/${ANALYTIC_EVENTS_ID}`, {
      visibility_type: "hidden",
    });
    await client.put(`/api/table/${FEEDBACK_ID}`, {
      visibility_type: "hidden",
    });
    await client.put(`/api/table/${INVOICES_ID}`, {
      visibility_type: "hidden",
    });

    const { id: ordersQuestionId } = await client.post("/api/card", {
      name: "Orders",
      type: "question",
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID },
        type: "query",
      },
      visualization_settings: {},
    });

    await client.post("/api/card", {
      name: "Orders, Count",
      type: "question",
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
        type: "query",
      },
      visualization_settings: {},
    });

    await client.post("/api/card", {
      name: "Orders, Count, Grouped by Created At (year)",
      type: "question",
      display: "line",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        type: "query",
      },
      visualization_settings: {},
    });

    const { id: dashboardId } = await client.post("/api/dashboard", {
      name: "Orders in a dashboard",
    });

    await client.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        {
          id: -1,
          card_id: ordersQuestionId,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
        },
      ],
    });

    await snapshot("without-models");

    await client.post("/api/card", {
      name: "Orders Model",
      type: "model",
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID },
        type: "query",
      },
      visualization_settings: {},
    });

    writeFileSync(
      resolve(__dirname, "cypress_sample_database.json"),
      JSON.stringify(SAMPLE_DATABASE, null, 2),
    );

    const createLoginCache = async () => {
      const loginResults = await Promise.all(
        Object.entries(USERS).map(async ([role, { email, password }]) => {
          const response = await client.post("/api/session", {
            username: email,
            password,
          });

          return [role, { sessionId: response.id }];
        }),
      );

      return Object.fromEntries(loginResults);
    };

    // Log in needs to happen before we take a snapshot because session IDs need
    // to be stored in the app db.
    const loginCache = await createLoginCache();
    await snapshot("default");

    const instanceData = await getDefaultInstanceData(client, loginCache);

    writeFileSync(
      resolve(__dirname, "cypress_sample_instance_data.json"),
      JSON.stringify(instanceData, null, 2),
    );

    const waitUntil = async (
      checkFn,
      { attempts = 10, delay = 1000, onFailMessage = "" },
    ) => {
      for (let i = 0; i < attempts; i++) {
        if (await checkFn()) {
          return;
        }

        await new Promise((r) => setTimeout(r, delay));
      }

      if (onFailMessage) {
        console.warn(onFailMessage);
      }
    };

    const waitForSyncComplete = async (id) => {
      await waitUntil(
        async () => {
          const db = await client.get(`/api/database/${id}`);
          console.log(`DB ${id} sync status: ${db.initial_sync_status}`);
          return db.initial_sync_status === "complete";
        },
        {
          attempts: 20,
          delay: 1000,
          onFailMessage:
            "The DB sync isn't complete yet, but let's be optimistic about it",
        },
      );
    };

    const waitForFieldsAnalyzed = async (id) => {
      await waitUntil(
        async () => {
          const schemas = await client.get(`/api/database/${id}/schemas`);
          const [firstSchema] = schemas;
          if (!firstSchema) {
            return false;
          }

          const schemaDetails = await client.get(
            `/api/database/${id}/schema/${firstSchema}`,
          );
          const tableId = schemaDetails[0]?.id;
          if (!tableId) {
            return false;
          }

          const table = await client.get(
            `/api/table/${tableId}/query_metadata`,
          );
          const field = table.fields.find((f) => f.semantic_type !== "type/PK");

          return !!field?.last_analyzed;
        },
        {
          attempts: 10,
          delay: 1000,
          onFailMessage: "The field sync isn't complete",
        },
      );
    };

    const assertOnDatabaseMetadata = async (engine) => {
      const { data } = await client.get("/api/database");
      const db = data.find((db) => db.engine === engine);

      if (!db) {
        throw new Error(`No database found with engine "${engine}"`);
      }

      const { id } = db;
      await waitForSyncComplete(id);
      await waitForFieldsAnalyzed(id);
    };

    const QA_DB_CREDENTIALS = {
      host: "localhost",
      user: "metabase",
      password: "metasample123",
      database: "sample",
      ssl: false,
    };

    const connectionConfig = {
      postgres: {
        client: "pg",
        connection: {
          ...QA_DB_CREDENTIALS,
          port: 5404,
        },
      },
      mysql: {
        client: "mysql2",
        connection: {
          ...QA_DB_CREDENTIALS,
          user: "root",
          port: 3304,
        },
      },
    };

    const dbCheckQuery = {
      postgres: "SELECT FROM pg_database WHERE datname = 'writable_db';",
      mysql:
        "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='writable_db'",
    };

    const schedules = {
      cache_field_values: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
      metadata_sync: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_type: "hourly",
      },
    };

    /**
     * POSTGRES
     */

    const { id: postgresID } = await client.post("/api/database", {
      engine: "postgres",
      name: "QA Postgres12",
      details: {
        dbname: "sample",
        host: "localhost",
        port: 5404,
        user: "metabase",
        password: "metasample123",
        authdb: null,
        "additional-options": null,
        "use-srv": false,
        "tunnel-enabled": false,
      },
      auto_run_queries: true,
      is_full_sync: true,
      schedules,
    });

    await assertOnDatabaseMetadata("postgres");
    await snapshot("postgres-12");

    console.log("⚙️ Setting up writable postgres");
    const writablePgResults = await connectAndQueryDB({
      connectionConfig: connectionConfig["postgres"],
      query: dbCheckQuery["postgres"],
    });
    if (!writablePgResults.rows.length) {
      await connectAndQueryDB({
        connectionConfig: connectionConfig["postgres"],
        query: "CREATE DATABASE writable_db",
      });
    }

    if (postgresID) {
      await client.put(`/api/database/${postgresID}`, {
        details: {
          dbname: "writable_db",
        },
        settings: { "database-enable-actions": true },
      });
    }
    await snapshot("postgres-writable");
    await client.post("/api/testing/restore/default");

    /**
     * MYSQL
     */

    const { id: mysqlID } = await client.post("/api/database", {
      engine: "mysql",
      name: "QA MySQL8",
      details: {
        dbname: "sample",
        host: "localhost",
        port: 3304,
        user: "metabase",
        password: "metasample123",
        authdb: null,
        "additional-options": "allowPublicKeyRetrieval=true",
        "use-srv": false,
        "tunnel-enabled": false,
      },
      auto_run_queries: true,
      is_full_sync: true,
      schedules,
    });

    await assertOnDatabaseMetadata("mysql");
    await snapshot("mysql-8");

    console.log("⚙️ Setting up writable mysql");
    const writableMysqlResults = await connectAndQueryDB({
      connectionConfig: connectionConfig["mysql"],
      query: dbCheckQuery["mysql"],
    });

    if (!writableMysqlResults.rows.length) {
      await connectAndQueryDB({
        connectionConfig: connectionConfig["mysql"],
        query: "CREATE DATABASE writable_db",
      });
    }

    if (mysqlID) {
      await client.put(`/api/database/${mysqlID}`, {
        details: {
          user: "root",
          dbname: "writable_db",
        },
        settings: { "database-enable-actions": true },
      });
    }
    await snapshot("mysql-writable");
    await client.post("/api/testing/restore/default");

    const { id: mongoID } = await client.post("/api/database", {
      engine: "mongo",
      name: "QA Mongo",
      details: {
        "advanced-options": false,
        "use-conn-uri": true,
        "conn-uri":
          "mongodb://metabase:metasample123@localhost:27004/sample?authSource=admin",
        "tunnel-enabled": false,
      },
      auto_run_queries: true,
      is_full_sync: true,
      schedules,
    });

    await assertOnDatabaseMetadata("mongo");
    await snapshot("mongo-5");
    await client.delete(`/api/database/${mongoID}`);
    await client.post("/api/testing/restore/default");

    console.log("🎉 Metabase seeding complete");
  } catch (err) {
    console.error("❌ Seeding failed:", err.message);
    process.exit(1);
  }
}

/**
 * Collects instance data for use in tests.
 * This mirrors the getDefaultInstanceData() function from default.cy.snap.js
 */
async function getDefaultInstanceData(client, loginCache) {
  const IS_ENTERPRISE = process.env.MB_EDITION === "ee";

  // This is something we need to do to ensure that the All tenant users group
  // comes back with the call to /api/permissions/groups. After the API calls are
  // finished, we disable it
  if (IS_ENTERPRISE) {
    await client.put("/api/setting", {
      "premium-embedding-token": process.env.CYPRESS_MB_ALL_FEATURES_TOKEN,
    });
    await client.put("/api/setting", {
      "use-tenants": true,
    });
  }

  const questions = await client.get("/api/card");
  const { data: users } = await client.get("/api/user");
  const { data: databases } = await client.get("/api/database");
  const groups = await client.get("/api/permissions/group");
  const collections = await client.get("/api/collection");

  // Fetch all dashboards from all collections
  const dashboards = [];
  for (const collection of collections) {
    const { data: collectionDashboards } = await client.get(
      `/api/collection/${collection.id}/items?models=dashboard`,
    );
    for (const dashboard of collectionDashboards || []) {
      if (!dashboards.find((d) => d.id === dashboard.id)) {
        const fullDashboard = await client.get(
          `/api/dashboard/${dashboard.id}`,
        );
        dashboards.push(fullDashboard);
      }
    }
  }

  if (IS_ENTERPRISE) {
    await client.put("/api/setting", {
      "use-tenants": false,
    });
  }

  return {
    loginCache,
    questions,
    users,
    databases,
    groups,
    collections,
    dashboards,
  };
}
