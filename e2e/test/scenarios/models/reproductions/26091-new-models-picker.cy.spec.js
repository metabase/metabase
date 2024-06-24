import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  entityPickerModal,
  entityPickerModalTab,
  popover,
  restore,
} from "e2e/support/helpers";

import { turnIntoModel } from "../helpers/e2e-models-helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const modelDetails = {
  name: "Old model",
  query: { "source-table": PRODUCTS_ID },
  type: "model",
};

describe("issue 26091", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("should allow to choose a newly created model in the data picker (metabase#26091)", () => {
    cy.createQuestion(modelDetails);
    cy.visit("/");

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").clear().type("New model");
      cy.findByText("Save").click();
      cy.wait("@saveQuestion");
    });
    cy.get("#QuestionSavedModal").within(() => {
      cy.button("Not now").click();
    });
    turnIntoModel();

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Models").click();
      cy.findByText("New model").should("be.visible");
      cy.findByText("Old model").should("be.visible");
      cy.findByText("Orders Model").should("be.visible");
    });
  });
});

const startNewQuestion = () => {
  cy.findByText("New").click();
  popover().within(() => cy.findByText("Question").click());
};
