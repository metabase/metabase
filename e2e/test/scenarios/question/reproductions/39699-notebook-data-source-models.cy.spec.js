import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SECOND_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import { restore, openNotebook } from "e2e/support/helpers";

const { REVIEWS_ID } = SAMPLE_DATABASE;

const modelDetails = {
  name: "GUI Model",
  query: { "source-table": REVIEWS_ID, limit: 1 },
  display: "table",
  type: "model",
  collection_id: SECOND_COLLECTION_ID,
};

describe("issue 39699", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(modelDetails, { visitQuestion: true });
  });

  it("data selector should properly show a model as the source (metabase#39699)", () => {
    openNotebook();
    cy.findByTestId("data-step-cell")
      .should("have.text", modelDetails.name)
      .click();

    cy.findByTestId("saved-entity-back-navigation").should(
      "have.text",
      "Models",
    );

    cy.findByTestId("saved-entity-collection-tree").within(() => {
      cy.findByLabelText("Our analytics")
        .should("have.attr", "aria-expanded", "false")
        .and("have.attr", "aria-selected", "false");
      cy.findByLabelText("First collection")
        .should("have.attr", "aria-expanded", "true")
        .and("have.attr", "aria-selected", "false");
      cy.findByLabelText("Second collection")
        .should("have.attr", "aria-expanded", "false")
        .and("have.attr", "aria-selected", "true");
    });

    cy.findByTestId("select-list")
      .findByLabelText(modelDetails.name)
      .should("have.attr", "aria-selected", "true");
  });
});
