import {
  restore,
  addPostgresDatabase,
  withDatabase,
} from "__support__/e2e/cypress";
import { USER_GROUPS } from "__support__/e2e/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;
const PG_DB_NAME = "QA Postgres12";
const PG_DB_ID = 2;

describe("postgres > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    addPostgresDatabase(PG_DB_NAME);
    cy.server();
  });

  // NOTE: This issue wasn't specifically related to PostgreSQL. We simply needed to add another DB to reproduce it.
  ["QB", "Native"].forEach(test => {
    it.skip(`${test.toUpperCase()} version:\n should be able to select question (from "Saved Questions") which belongs to the database user doesn't have data-permissions for (metabase#13347)`, () => {
      cy.route("POST", "/api/dataset").as("dataset");

      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP]: {
          1: { schemas: "all", native: "write" },
          [PG_DB_ID]: { schemas: "none", native: "none" },
        },
      });

      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { root: "read" },
      });

      withDatabase(
        PG_DB_ID,
        ({ ORDERS_ID }) =>
          cy.createQuestion({
            name: "Q1",
            query: { "source-table": ORDERS_ID },
            database: PG_DB_ID,
          }),

        cy.createNativeQuestion({
          name: "Q2",
          native: { query: "SELECT * FROM ORDERS" },
          database: PG_DB_ID,
        }),
      );

      cy.signIn("none");
      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      test === "QB" ? cy.findByText("Q1").click() : cy.findByText("Q2").click();
      cy.wait("@dataset", { timeout: 5000 });
      cy.contains("37.65");
    });
  });
});
