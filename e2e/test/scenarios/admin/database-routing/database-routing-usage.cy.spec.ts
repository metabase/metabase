const { H } = cy;
import _ from "underscore";

import { USER_GROUPS } from "e2e/support/cypress_data";
import { DataPermissionValue } from "metabase/admin/permissions/types";

import { interceptPerformanceRoutes } from "../performance/helpers/e2e-performance-helpers";

import {
  BASE_POSTGRES_DESTINATION_DB_INFO,
  DB_ROUTER_USERS,
  configurDbRoutingViaAPI,
  createDbWithIdentifierTable,
  createDestinationDatabasesViaAPI,
  signInAs,
} from "./helpers/e2e-database-routing-helpers";

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;

describe("admin > database > database routing", { tags: ["@external"] }, () => {
  before(() => {
    // For DB Routing it's important all the tables have the same schema
    createDbWithIdentifierTable({ dbName: "lead" });
    createDbWithIdentifierTable({ dbName: "destination_one" });
    createDbWithIdentifierTable({ dbName: "destination_two" });

    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    Object.values(DB_ROUTER_USERS).forEach((user) => {
      // @ts-expect-error - this isn't typed yet
      cy.createUserFromRawData(user);
    });

    H.addPostgresDatabase("lead", false, "lead", "leadDbId").then(function () {
      configurDbRoutingViaAPI({
        router_database_id: this.leadDbId,
        user_attribute: "destination_database",
      });
      createDestinationDatabasesViaAPI({
        router_database_id: this.leadDbId,
        databases: [
          {
            ...BASE_POSTGRES_DESTINATION_DB_INFO,
            name: "destination_one",
            details: {
              ...BASE_POSTGRES_DESTINATION_DB_INFO.details,
              dbname: "destination_one",
            },
          },
          {
            ...BASE_POSTGRES_DESTINATION_DB_INFO,
            name: "destination_two",
            details: {
              ...BASE_POSTGRES_DESTINATION_DB_INFO.details,
              dbname: "destination_two",
            },
          },
        ],
      });

      cy.request(
        "GET",
        `/api/database/${this.leadDbId}/metadata?include_hidden=true`,
      ).then(({ body }) => {
        const dbIdentifierTable = _.findWhere(body.tables, {
          name: "db_identifier",
        });
        cy.wrap(dbIdentifierTable.id).as("leadDb_db_identifier_table_ID");
        const colorField = _.findWhere(dbIdentifierTable.fields, {
          name: "color",
        });
        cy.wrap(colorField.id).as("leadDb_color_field_ID");
      });
    });

    H.addPostgresDatabase(
      "destination_one",
      false,
      "destination_one",
      "destinationOneDbId",
    ).then(function () {
      cy.request(
        "GET",
        `/api/database/${this.destinationOneDbId}/metadata?include_hidden=true`,
      ).then(({ body }) => {
        const dbIdentifierTable = _.findWhere(body.tables, {
          name: "db_identifier",
        });
        cy.wrap(dbIdentifierTable.id).as(
          "destinationOneDb_db_identifier_table_ID",
        );
        const colorField = _.findWhere(dbIdentifierTable.fields, {
          name: "color",
        });
        cy.wrap(colorField.id).as("destinationOneDb_color_field_ID");
      });
    });
    H.snapshot("db-routing-3-dbs");
  });

  beforeEach(() => {
    H.restore("db-routing-3-dbs" as any);
    cy.signInAsAdmin();
  });

  it("should route users to the correct destination database", function () {
    H.createNativeQuestion({
      database: this.leadDbId,
      name: "Native Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    }).then(({ body: { id: questionId } }) => {
      cy.log("Admin should see primary db");
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "lead");
      cy.get('[data-column-id="name"]')
        .should("not.contain", "destination_one")
        .should("not.contain", "destination_two");

      cy.log("User with __METABASE_ROUTER__ should see primary db");
      signInAs(DB_ROUTER_USERS.userWithMetabaseRouterAttr);
      cy.get('[data-column-id="name"]').should("contain", "lead");
      cy.get('[data-column-id="name"]')
        .should("not.contain", "destination_one")
        .should("not.contain", "destination_two");

      cy.log("User A");
      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_two",
      );
      cy.log("User B");
      signInAs(DB_ROUTER_USERS.userB);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_two");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_one",
      );

      cy.log("User A");
      signInAs(DB_ROUTER_USERS.userWrongAttribute);
      H.visitQuestion(questionId);
      cy.findByTestId("query-visualization-root").findByText(
        "Database Routing error: No Destination Database with slug `wrong_destination` found.",
      );

      cy.log("User with no attribute");
      signInAs(DB_ROUTER_USERS.userNoAttribute);
      H.visitQuestion(questionId);
      cy.findByTestId("query-visualization-root").findByText(
        "Required user attribute is missing. Cannot route to a Destination Database.",
      );
    });

    cy.signInAsAdmin();
    H.createQuestion({
      name: "DB Identifier Name",
      database: this.leadDbId,
      query: {
        "source-table": this.leadDb_db_identifier_table_ID,
      },
    }).then(({ body: { id: questionId } }) => {
      cy.log("Admin should see primary db");
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "lead");
      cy.get('[data-column-id="name"]')
        .should("not.contain", "destination_one")
        .should("not.contain", "destination_two");

      cy.log("User with __METABASE_ROUTER__ should see primary db");
      signInAs(DB_ROUTER_USERS.userWithMetabaseRouterAttr);
      cy.get('[data-column-id="name"]').should("contain", "lead");
      cy.get('[data-column-id="name"]')
        .should("not.contain", "destination_one")
        .should("not.contain", "destination_two");

      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_two",
      );

      cy.log("User A");
      signInAs(DB_ROUTER_USERS.userB);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_two");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_one",
      );

      cy.log("User with wrong attribute");
      signInAs(DB_ROUTER_USERS.userWrongAttribute);
      H.visitQuestion(questionId);
      cy.findByTestId("query-visualization-root").findByText(
        "Database Routing error: No Destination Database with slug `wrong_destination` found.",
      );

      cy.log("User with no attribute");
      signInAs(DB_ROUTER_USERS.userNoAttribute);
      H.visitQuestion(questionId);
      cy.findByTestId("query-visualization-root").findByText(
        "Required user attribute is missing. Cannot route to a Destination Database.",
      );
    });
  });

  it("should not leak cached data", function () {
    H.createNativeQuestion({
      database: this.leadDbId,
      name: "Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    }).then(({ body: { id: questionId } }) => {
      interceptPerformanceRoutes();
      cy.request("PUT", "api/cache", {
        model: "question",
        model_id: questionId,
        strategy: {
          refresh_automatically: false,
          unit: "hours",
          duration: 24,
          type: "duration",
        },
      });
      cy.request("GET", `api/cache?model=question&id=${questionId}`);

      cy.log("User A");
      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_two",
      );

      cy.log("User B");
      signInAs(DB_ROUTER_USERS.userB);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_two");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_one",
      );
    });
  });

  it("should work with sandboxing", function () {
    H.createQuestion({
      name: "Color",
      database: this.leadDbId,
      query: {
        "source-table": this.leadDb_db_identifier_table_ID,
      },
    }).then(({ body: { id: questionId } }) => {
      cy.log("Sandboxing a destination db should have no effect");
      H.blockUserGroupPermissions(ALL_USERS_GROUP, this.destinationOneDbId);
      cy.sandboxTable({
        table_id: this.destinationOneDb_db_identifier_table_ID,
        group_id: COLLECTION_GROUP,
        attribute_remappings: {
          color: ["dimension", ["field", this.destinationOneDb_color_field_ID]],
        },
      });

      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="color"]').should("contain", "blue");
      cy.get('[data-column-id="color"]').should("contain", "red");

      cy.signInAsAdmin();
      H.blockUserGroupPermissions(ALL_USERS_GROUP, this.leadDbId);
      cy.sandboxTable({
        table_id: this.leadDb_db_identifier_table_ID,
        group_id: COLLECTION_GROUP,
        attribute_remappings: {
          color: ["dimension", ["field", this.leadDb_color_field_ID]],
        },
      });

      cy.log(
        "Unrestricted access on the destination db should not affect sandboxing",
      );
      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP]: {
          [this.destinationOneDbId]: {
            "view-data": DataPermissionValue.UNRESTRICTED,
          },
        },
      });

      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="color"]').should("contain", "blue");
      cy.get('[data-column-id="color"]').should("not.contain", "red");

      cy.log("Test sandboxing using a question");
      cy.signInAsAdmin();
      H.createNativeQuestion({
        name: "Red Color",
        database: this.leadDbId,
        native: {
          query: "SELECT * FROM db_identifier WHERE color='red'",
        },
      }).then(({ body: { id: redColorQuestionId } }) => {
        H.blockUserGroupPermissions(COLLECTION_GROUP, this.leadDbId);
        cy.sandboxTable({
          table_id: this.leadDb_db_identifier_table_ID,
          group_id: COLLECTION_GROUP,
          card_id: redColorQuestionId,
        });
        signInAs(DB_ROUTER_USERS.userA);
        H.visitQuestion(questionId);
        cy.get('[data-column-id="name"]').should("contain", "destination_one");
        cy.get('[data-column-id="color"]').should("contain", "red");
        cy.get('[data-column-id="color"]').should("not.contain", "blue");
      });
    });
  });

  it("should work with impersonation", function () {
    H.createNativeQuestion({
      name: "Native Color",
      database: this.leadDbId,
      native: {
        query: "SELECT * FROM db_identifier;",
      },
    }).then(({ body: { id: questionId } }) => {
      cy.log("Impersonating a destination db should have no effect");
      H.blockUserGroupPermissions(ALL_USERS_GROUP, this.destinationOneDbId);
      cy.updatePermissionsGraph(
        {
          [COLLECTION_GROUP]: {
            [this.destinationOneDbId]: {
              "view-data": DataPermissionValue.IMPERSONATED,
            },
          },
        },
        [
          {
            db_id: this.destinationOneDbId,
            group_id: COLLECTION_GROUP,
            attribute: "db_role",
          },
        ],
      );

      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="color"]').should("contain", "blue");
      cy.get('[data-column-id="color"]').should("contain", "red");

      cy.signInAsAdmin();
      H.blockUserGroupPermissions(ALL_USERS_GROUP, this.leadDbId);
      cy.updatePermissionsGraph(
        {
          [COLLECTION_GROUP]: {
            [this.leadDbId]: {
              "view-data": DataPermissionValue.IMPERSONATED,
            },
          },
        },
        [
          {
            db_id: this.leadDbId,
            group_id: COLLECTION_GROUP,
            attribute: "db_role",
          },
        ],
      );

      cy.log(
        "Unrestricted access on the destination db should not affect impersonation",
      );
      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP]: {
          [this.destinationOneDbId]: {
            "view-data": DataPermissionValue.UNRESTRICTED,
          },
        },
      });

      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="color"]').should("contain", "blue");
      cy.get('[data-column-id="color"]').should("not.contain", "red");
    });
  });
});
