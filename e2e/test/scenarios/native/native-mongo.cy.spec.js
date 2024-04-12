import { USER_GROUPS } from "e2e/support/cypress_data";
import { restore } from "e2e/support/helpers";

const MONGO_DB_NAME = "QA Mongo";
const MONGO_DB_ID = 2;
const { ALL_USERS_GROUP } = USER_GROUPS;

describe("scenarios > question > native > mongo", { tags: "@mongo" }, () => {
  before(() => {
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore("mongo-5");
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [MONGO_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
    });
    cy.signInAsNormalUser();

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // Reproduces metabase#20499 issue
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Native query").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(MONGO_DB_NAME).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a table").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
  });

  it("can save a native MongoDB query", () => {
    cy.get(".ace_content")
      .should("be.visible")
      .type('[ { $count: "Total" } ]', {
        parseSpecialCharSequences: false,
      });
    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.wait("@dataset");

    cy.findByTextEnsureVisible("18,760");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByTextEnsureVisible("Save new question");

    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByLabelText("Name").clear().should("be.empty").type("mongo count");

      cy.findByText("Save").should("not.be.disabled").click();
    });

    cy.wait("@createQuestion");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();

    cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
  });
});
