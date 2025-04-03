const { H } = cy;
import {
  QA_DB_CREDENTIALS,
  QA_POSTGRES_PORT,
  USER_GROUPS,
} from "e2e/support/cypress_data";
import type { DatabaseData, User } from "metabase-types/api";

import { interceptPerformanceRoutes } from "./performance/helpers/e2e-performance-helpers";
import {
  durationRadioButton,
  openSidebarCacheStrategyForm,
  saveCacheStrategyForm,
} from "./performance/helpers/e2e-strategy-form-helpers";

const { ALL_USERS_GROUP, DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;

const personA = {
  first_name: "Don",
  last_name: "RouterA",
  email: "routerA@metabase.test",
  password: "12341234",
  login_attributes: {
    destination_database: "postgres_two",
  },
  user_group_memberships: [
    { id: ALL_USERS_GROUP, is_group_manager: false },
    { id: COLLECTION_GROUP, is_group_manager: false },
    { id: DATA_GROUP, is_group_manager: false },
  ],
};

const personB = {
  first_name: "Tom",
  last_name: "RouterB",
  email: "routerB@metabase.test",
  password: "12341234",
  login_attributes: {
    destination_database: "postgres_three",
  },
  user_group_memberships: [
    { id: ALL_USERS_GROUP, is_group_manager: false },
    { id: COLLECTION_GROUP, is_group_manager: false },
    { id: DATA_GROUP, is_group_manager: false },
  ],
};

describe("admin > database > database routing", { tags: ["@external"] }, () => {
  before(() => {
    cy.signInAsAdmin();
    H.queryWritableDB(
      "SELECT datname from pg_database WHERE datname = 'lead'",
    ).then((res: { rows: any[] }) => {
      if (res.rows.length === 0) {
        H.queryWritableDB("CREATE DATABASE lead;");
      }
    });

    H.queryWritableDB(
      "SELECT datname from pg_database WHERE datname = 'postgres_two'",
    ).then((res: { rows: any[] }) => {
      if (res.rows.length === 0) {
        H.queryWritableDB("CREATE DATABASE postgres_two;");
      }
    });

    H.queryWritableDB(
      "SELECT datname from pg_database WHERE datname = 'postgres_three'",
    ).then((res) => {
      if (res.rows.length === 0) {
        H.queryWritableDB("CREATE DATABASE postgres_three;");
      }
    });

    const leadConfig = {
      client: "pg",
      connection: {
        ...QA_DB_CREDENTIALS,
        port: QA_POSTGRES_PORT,
        name: "lead",
        database: "lead",
      },
    };

    const aConfig = {
      client: "pg",
      connection: {
        ...QA_DB_CREDENTIALS,
        port: QA_POSTGRES_PORT,
        name: "postgres_two",
        database: "postgres_two",
      },
    };

    const bConfig = {
      client: "pg",
      connection: {
        ...QA_DB_CREDENTIALS,
        port: QA_POSTGRES_PORT,
        name: "postgres_three",
        database: "postgres_three",
      },
    };

    cy.task("connectAndQueryDB", {
      connectionConfig: leadConfig,
      query: "CREATE TABLE IF NOT EXISTS db_identifier (name VARCHAR(50));",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: leadConfig,
      query: "DELETE FROM db_identifier;",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: leadConfig,
      query: "INSERT INTO db_identifier VALUES ('lead');",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: aConfig,
      query: "CREATE TABLE IF NOT EXISTS db_identifier (name VARCHAR(50));",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: aConfig,
      query: "DELETE FROM db_identifier;",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: aConfig,
      query: "INSERT INTO db_identifier VALUES ('postgres_two');",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: bConfig,
      query: "CREATE TABLE IF NOT EXISTS db_identifier (name VARCHAR(50));",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: bConfig,
      query: "DELETE FROM db_identifier;",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: bConfig,
      query: "INSERT INTO db_identifier VALUES ('postgres_three');",
    });

    cy.task("connectAndQueryDB", {
      connectionConfig: bConfig,
      query: "SELECT name FROM db_identifier;",
    });

    H.setTokenFeatures("all");
    // @ts-expect-error - this isn't typed yet
    cy.createUserFromRawData(personA);
    // @ts-expect-error - this isn't typed yet
    cy.createUserFromRawData(personB);

    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.addPostgresDatabase("lead", false, "lead");
    H.addPostgresDatabase("Postgres Two", false, "postgres_two");
    H.addPostgresDatabase("Postgres Three", false, "postgres_three");
    H.snapshot("db-routing-3-dbs");
  });

  beforeEach(() => {
    H.restore("db-routing-3-dbs" as any);
    cy.signInAsAdmin();
  });

  it("should connect multiple DBs", () => {
    cy.visit("/admin/databases");
    cy.findByTestId("database-list").within(() => {
      cy.findByText("Postgres Two");
      cy.findByText("Postgres Three");
    });
  });

  it("should route users to the correct destination database", () => {
    cy.visit("/admin/databases/3");
    configurDbRoutingViaAPI({
      router_database_id: 3,
      user_attribute: "destination_database",
    });

    createDestinationDatabasesViaAPI({
      router_database_id: 3,
      databases: [
        {
          ...BASE_POSTGRES_MIRROR_DB_INFO,
          name: "postgres_two",
          details: {
            ...BASE_POSTGRES_MIRROR_DB_INFO.details,
            dbname: "postgres_two",
          },
        },
        {
          ...BASE_POSTGRES_MIRROR_DB_INFO,
          name: "postgres_three",
          details: {
            ...BASE_POSTGRES_MIRROR_DB_INFO.details,
            dbname: "postgres_three",
          },
        },
      ],
    });

    cy.signInAsAdmin();
    H.createNativeQuestion({
      database: 3,
      name: "Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    }).then(({ body: { id: questionId } }) => {
      // Test with user a
      cy.signOut();
      signInAs(personA);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "postgres_two");
      // Test with user b
      cy.signOut();
      signInAs(personB);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "postgres_three");

      cy.signInAsAdmin();
      interceptPerformanceRoutes();
      cy.visit(`/question/${questionId}`);
      openSidebarCacheStrategyForm("question");
      durationRadioButton().click();
      saveCacheStrategyForm({ strategyType: "duration", model: "database" });
      // Test with user a
      signInAs(personA);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "postgres_two");
      // Test with user b
      cy.signOut();
      signInAs(personB);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "postgres_three");
    });
  });
});

const BASE_POSTGRES_MIRROR_DB_INFO = {
  is_on_demand: false,
  is_full_sync: true,
  is_sample: false,
  cache_ttl: null,
  refingerprint: false,
  auto_run_queries: true,
  schedules: {},
  details: {
    host: "localhost",
    port: QA_POSTGRES_PORT,
    dbname: "sample",
    user: "metabase",
    "use-auth-provider": false,
    password: "metasample123",
    "schema-filters-type": "all",
    ssl: false,
    "tunnel-enabled": false,
    "advanced-options": false,
  },
  name: "Destination DB",
  engine: "postgres",
};

function configurDbRoutingViaAPI({
  router_database_id,
  user_attribute,
}: {
  router_database_id: number;
  user_attribute: string | null;
}) {
  cy.request(
    "PUT",
    `/api/ee/database-routing/router-database/${router_database_id}`,
    { user_attribute },
  );
}

function createDestinationDatabasesViaAPI({
  router_database_id,
  databases,
}: {
  router_database_id: number;
  databases: DatabaseData[];
}) {
  cy.request("POST", "/api/ee/database-routing/mirror-database", {
    router_database_id,
    mirrors: databases,
  });
}

function signInAs(user: Partial<User> & { password: string }) {
  cy.log(`Sign in as user via an API call: ${user.email}`);
  return cy.request("POST", "/api/session", {
    username: user.email,
    password: user.password,
  });
}
