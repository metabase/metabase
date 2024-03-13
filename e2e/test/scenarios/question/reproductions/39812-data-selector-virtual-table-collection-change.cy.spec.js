import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitModel,
  openNotebook,
  openQuestionActions,
  popover,
} from "e2e/support/helpers";

describe("issue 39812", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("moving the source model or a question to another collection should immediately be refreclted in the data selector (metabase#39812)", () => {
    visitModel(ORDERS_MODEL_ID);
    openNotebook();
    cy.findByTestId("data-step-cell").click();
    cy.findByLabelText("Our analytics").should(
      "have.attr",
      "aria-selected",
      "true",
    );
    cy.findByLabelText("Orders Model").should(
      "have.attr",
      "aria-selected",
      "true",
    );
    moveToCollection("First collection");

    cy.findByTestId("data-step-cell").click();
    cy.findByLabelText("First collection").should(
      "have.attr",
      "aria-selected",
      "true",
    );
    cy.findByLabelText("Orders Model").should(
      "have.attr",
      "aria-selected",
      "true",
    );
  });
});

function moveToCollection(collection) {
  openQuestionActions();
  popover().findByTextEnsureVisible("Move").click();
  cy.findByRole("dialog").within(() => {
    cy.intercept("GET", "/api/collection/tree**").as("updateCollectionTree");
    cy.findAllByTestId("item-picker-item")
      .filter(`:contains(${collection})`)
      .click();

    cy.button("Move").click();
    cy.wait("@updateCollectionTree");
  });
}
