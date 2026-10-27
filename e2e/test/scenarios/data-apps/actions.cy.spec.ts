import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  visitDataAppRoute as visitAppRoute,
} from "e2e/support/helpers";
import type { DataApp } from "metabase-types/api";

import { createAddTeamAction, createKitchenSinkQuestions } from "./helpers";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";
const EXISTING_TEAM = "Amorous Aardvarks";

describe(
  "scenarios > data apps > actions (useAction)",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      H.resetTestTable({ type: "postgres", table: TEST_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);
    });

    const setupActionsApp = ({
      groupAccess = (app) =>
        H.addDataAppGroups(app, [USER_GROUPS.ALL_USERS_GROUP]),
    }: { groupAccess?: (app: DataApp) => void } = {}) => {
      H.createLibrary();
      H.publishTables({ table_ids: [SAMPLE_DATABASE.ORDERS_ID] });
      H.createDataApp({
        name: APP_NAME,
        display_name: APP_DISPLAY_NAME,
      }).then((app) => {
        groupAccess(app);
        createKitchenSinkQuestions(app);
        createAddTeamAction(app.resource_collection_id);
        H.uploadDataAppBundle(app);
      });
    };

    it("executes the action, exposing isExecuting and result, and resets", () => {
      cy.intercept("POST", "/api/action/*/execute", (req) => {
        req.on("response", (res) => {
          res.setDelay(300);
        });
      });

      setupActionsApp();

      visitAppRoute("actions");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("action-execute").click();
        cy.findByTestId("action-executing").should("have.text", "executing");

        cy.findByTestId("action-result", { timeout: 30000 }).should(
          "have.text",
          "has-result",
        );
        cy.findByTestId("action-output").should("have.text", "returned-result");
        cy.findByTestId("action-error").should("have.text", "no-error");

        cy.findByTestId("action-reset").click();
        cy.findByTestId("action-result").should("have.text", "no-result");
      });

      H.queryWritableDB(
        `SELECT team_name, score FROM ${TEST_TABLE} WHERE team_name = 'Data App FC'`,
      ).then(({ rows }) => {
        expect(rows).to.have.length(1);
        expect(rows[0].score).to.eq(7);
      });
    });

    it("surfaces an error when the action fails", () => {
      // `team_name` is unique, so creating a team that already exists fails in the
      // database — a real rejection, not a stubbed one.
      setupActionsApp();

      visitAppRoute("actions-existing-team");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("action-execute").click();

        cy.findByTestId("action-error", { timeout: 30000 }).should(
          "have.text",
          "has-error",
        );
        cy.findByTestId("action-result").should("have.text", "no-result");
        cy.findByTestId("action-executing").should("have.text", "idle");
      });

      H.queryWritableDB(
        `SELECT team_name FROM ${TEST_TABLE} WHERE team_name = '${EXISTING_TEAM}'`,
      ).then(({ rows }) => {
        // Nothing was written - the existing team is still the only one.
        expect(rows).to.have.length(1);
      });
    });

    describe("collection permissions", () => {
      it("executes the action when the user has view access to the app's collection", () => {
        setupActionsApp({
          groupAccess: (app) =>
            H.setDataAppCollectionAccess(app.resource_collection_id, "read"),
        });
        cy.signInAsNormalUser();

        visitAppRoute("actions");
        H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId("action-execute").click();

          cy.findByTestId("action-result", { timeout: 30000 }).should(
            "have.text",
            "has-result",
          );
          cy.findByTestId("action-error").should("have.text", "no-error");
        });

        H.queryWritableDB(
          `SELECT team_name, score FROM ${TEST_TABLE} WHERE team_name = 'Data App FC'`,
        ).then(({ rows }) => {
          expect(rows).to.have.length(1);
          expect(rows[0].score).to.eq(7);
        });
      });
    });
  },
);
