import { USER_GROUPS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitQuestion,
  isEE,
  popover,
  setTokenFeatures,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;

describe("UI elements that make no sense for users without data permissions (metabase#22447, metabase##22449, metabase#22450)", () => {
  beforeEach(() => {
    restore();
  });

  it("should not offer to save question to users with no data permissions", () => {
    cy.signIn("nodata");

    visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("viz-settings-button");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();

    cy.findByTestId("display-options-sensible");
    cy.icon("line").click();
    cy.findByTestId("Line-button").realHover();
    cy.findByTestId("Line-button").within(() => {
      cy.icon("gear").click();
    });

    cy.findByTextEnsureVisible("Line options");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save")
      .as("saveButton")
      .invoke("css", "pointer-events")
      .should("equal", "none");

    cy.get("@saveButton").realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You don't have permission to save this question.");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.icon("refresh").should("not.exist");
    });

    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();

    popover()
      .should("contain", "Dashboard")
      .and("contain", "Collection")
      .and("not.contain", "Question");
  });

  it("should not show visualization or question settings to users with block data permissions", () => {
    cy.onlyOn(isEE);

    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "block" }, "view-data": "blocked" },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "block" }, "view-data": "blocked" },
      },
    });

    cy.signIn("nodata");

    visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTextEnsureVisible("There was a problem with your question");

    cy.findByTestId("viz-settings-button").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("not.exist");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.icon("refresh").should("not.exist");
    });
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();

    popover()
      .should("contain", "Dashboard")
      .and("contain", "Collection")
      .and("not.contain", "Question");
  });
});
