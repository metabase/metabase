import { restore, visitQuestion, isEE, popover } from "__support__/e2e/helpers";
import { USER_GROUPS, SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;

describe("UI elements that make no sense for users without data permissions (metabase#22447, metabase##22449, metabase#22450)", () => {
  beforeEach(() => {
    restore();
  });

  it("should not offer to save question to users with no data permissions", () => {
    cy.signIn("nodata");

    visitQuestion("1");

    cy.findByText("Settings");
    cy.findByText("Visualization").click();

    cy.findByTextEnsureVisible("Choose a visualization");
    cy.icon("line").click();

    cy.findByTextEnsureVisible("Line options");
    cy.findByText("Save")
      .as("saveButton")
      .invoke("css", "pointer-events")
      .should("equal", "none");

    cy.get("@saveButton").realHover();
    cy.findByText("You don't have permission to save this question.");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.icon("refresh").should("not.exist");
    });

    cy.visit("/collection/root");
    cy.findByText("New").click();

    popover()
      .should("contain", "Dashboard")
      .and("contain", "Collection")
      .and("not.contain", "Question");
  });

  it("should not show visualization or question settings to users with block data permissions", () => {
    cy.onlyOn(isEE);

    cy.signInAsAdmin();
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "block" } },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "block" } },
      },
    });

    cy.signIn("nodata");

    visitQuestion("1");

    cy.findByTextEnsureVisible("There was a problem with your question");

    cy.findByText("Settings").should("not.exist");
    cy.findByText("Visualization").should("not.exist");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.icon("refresh").should("not.exist");
    });
    cy.visit("/collection/root");
    cy.findByText("New").click();

    popover()
      .should("contain", "Dashboard")
      .and("contain", "Collection")
      .and("not.contain", "Question");
  });
});
