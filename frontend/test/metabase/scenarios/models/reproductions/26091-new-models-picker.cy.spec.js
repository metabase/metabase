import { modal, popover, restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { turnIntoModel } from "../helpers/e2e-models-helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const modelDetails = {
  name: "Old model",
  query: { "source-table": PRODUCTS_ID },
  dataset: true,
};

describe("issue 26091", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database/*/datasets/*").as("getModels");
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("should allow to choose a newly created model in the data picker (metabase#26091)", () => {
    cy.createQuestion(modelDetails);
    cy.visit("/");

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Models").click();
      cy.wait("@getModels");
    });

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByLabelText("Name").clear().type("New model");
      cy.button("Save").click();
      cy.wait("@saveQuestion");
    });
    modal().within(() => {
      cy.button("Not now").click();
    });
    turnIntoModel();

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Models").click();
      cy.findByText("Old model").should("be.visible");
      cy.findByText("New model").should("be.visible");
    });
  });
});

const startNewQuestion = () => {
  cy.findByText("New").click();
  popover().within(() => cy.findByText("Question").click());
};
