const { H } = cy;
import {
  QA_DB_CREDENTIALS,
  QA_POSTGRES_PORT,
  USER_GROUPS,
} from "e2e/support/cypress_data";
import type { User } from "metabase-types/api";

import { interceptPerformanceRoutes } from "../performance/helpers/e2e-performance-helpers";
import {
  durationRadioButton,
  openSidebarCacheStrategyForm,
  saveCacheStrategyForm,
} from "../performance/helpers/e2e-strategy-form-helpers";

import {
  BASE_POSTGRES_MIRROR_DB_INFO,
  configurDbRoutingViaAPI,
  createDestinationDatabasesViaAPI,
} from "./helpers/e2e-database-routing-helpers";

const { ALL_USERS_GROUP, DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;

describe("admin > database > database routing", { tags: ["@external"] }, () => {
  before(() => {
    // For DB Routing it's important all the tables have the same schema
    createDbWithIdentifierTable({ dbName: "lead" });
    createDbWithIdentifierTable({ dbName: "destination_one" });
    createDbWithIdentifierTable({ dbName: "destination_two" });

    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
    Object.values(DB_ROUTER_USERS).forEach((user) => {
      // @ts-expect-error - this isn't typed yet
      cy.createUserFromRawData(user);
    });

    // With DB routing we only add the primary db directly
    // the other dbs get linked when they're added as destination dbs
    H.addPostgresDatabase("lead", false, "lead");
    configurDbRoutingViaAPI({
      router_database_id: 3,
      user_attribute: "destination_database",
    });
    createDestinationDatabasesViaAPI({
      router_database_id: 3,
      databases: [
        {
          ...BASE_POSTGRES_MIRROR_DB_INFO,
          name: "destination_one",
          details: {
            ...BASE_POSTGRES_MIRROR_DB_INFO.details,
            dbname: "destination_one",
          },
        },
        {
          ...BASE_POSTGRES_MIRROR_DB_INFO,
          name: "destination_two",
          details: {
            ...BASE_POSTGRES_MIRROR_DB_INFO.details,
            dbname: "destination_two",
          },
        },
      ],
    });
    H.snapshot("db-routing-3-dbs");
  });

  beforeEach(() => {
    H.restore("db-routing-3-dbs" as any);
    cy.signInAsAdmin();
  });

  it("should route users to the correct destination database", () => {
    cy.signInAsAdmin();
    H.createNativeQuestion({
      database: 3,
      name: "Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    }).then(({ body: { id: questionId } }) => {
      // Test with userA
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userA);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      // Test with userB
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userB);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "destination_two");

      // Test with user with wrong attribute value
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userWrongAttribute);
      cy.visit(`/question/${questionId}`);
      cy.findByText("No Mirror Database found for user attribute");

      // Test with user with no attribute
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userWrongAttribute);
      cy.visit(`/question/${questionId}`);
      cy.findByText("No Mirror Database found for user attribute");
    });
  });

  it("should not leak cached data", () => {
    cy.signInAsAdmin();
    H.createNativeQuestion({
      database: 3,
      name: "Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    }).then(({ body: { id: questionId } }) => {
      interceptPerformanceRoutes();
      cy.visit(`/question/${questionId}`);
      openSidebarCacheStrategyForm("question");
      durationRadioButton().click();
      saveCacheStrategyForm({ strategyType: "duration", model: "database" });
      // Test with user a
      signInAs(DB_ROUTER_USERS.userA);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      // Test with user b
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userB);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "destination_two");
    });
  });
});

const DB_ROUTER_USERS = {
  userA: {
    first_name: "Don",
    last_name: "RouterA",
    email: "routerA@metabase.test",
    password: "12341234",
    login_attributes: {
      destination_database: "destination_one",
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
      { id: DATA_GROUP, is_group_manager: false },
    ],
  },

  userB: {
    first_name: "Tom",
    last_name: "RouterB",
    email: "routerB@metabase.test",
    password: "12341234",
    login_attributes: {
      destination_database: "destination_two",
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
      { id: DATA_GROUP, is_group_manager: false },
    ],
  },

  userNoAttribute: {
    first_name: "Jane",
    last_name: "NoAttribute",
    email: "noattribute@metabase.test",
    password: "12341234",
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
      { id: DATA_GROUP, is_group_manager: false },
    ],
  },

  userWrongAttribute: {
    first_name: "Bill",
    last_name: "WrongAttribute",
    email: "wrongattribute@metabase.test",
    password: "12341234",
    login_attributes: {
      destination_database: "wrong_destination",
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
      { id: DATA_GROUP, is_group_manager: false },
    ],
  },
};

function signInAs(user: Partial<User> & { password: string }) {
  cy.log(`Sign in as user via an API call: ${user.email}`);
  return cy.request("POST", "/api/session", {
    username: user.email,
    password: user.password,
  });
}

function createDbWithIdentifierTable({ dbName }: { dbName: string }) {
  H.queryWritableDB(
    `SELECT datname from pg_database WHERE datname = '${dbName}'`,
  ).then((res: { rows: any }) => {
    if (res.rows.length === 0) {
      H.queryWritableDB(`CREATE DATABASE ${dbName};`);
    }
  });

  const dbConfig = {
    client: "pg",
    connection: {
      ...QA_DB_CREDENTIALS,
      port: QA_POSTGRES_PORT,
      name: dbName,
      database: dbName,
    },
  };
  cy.task("connectAndQueryDB", {
    connectionConfig: dbConfig,
    query: "CREATE TABLE IF NOT EXISTS db_identifier (name VARCHAR(50));",
  });

  cy.task("connectAndQueryDB", {
    connectionConfig: dbConfig,
    query: "DELETE FROM db_identifier;",
  });

  cy.task("connectAndQueryDB", {
    connectionConfig: dbConfig,
    query: `INSERT INTO db_identifier VALUES ('${dbName}');`,
  });
}
