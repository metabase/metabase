import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const modelDetails = {
  name: "20517",
  query: {
    "source-table": ORDERS_ID,
    limit: 5,
  },
  type: "model",
};

describe("issue 20517", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(modelDetails).then(({ body: { id } }) => {
      cy.intercept("POST", `/api/card/${id}/query`).as("modelQuery");
      cy.intercept("PUT", `/api/card/${id}`).as("updateModel");
      cy.visit(`/model/${id}/metadata`);
      cy.wait("@modelQuery");
    });
  });

  it("should be able to save metadata changes with empty description (metabase#20517)", () => {
    cy.findByTestId("dataset-edit-bar")
      .button("Save changes")
      .should("be.disabled");
    cy.findByDisplayValue(/^This is a unique ID/).clear();
    cy.findByDisplayValue(/^This is a unique ID/).should("not.exist");
    cy.findByTestId("dataset-edit-bar")
      .button("Save changes")
      .should("not.be.disabled")
      .click();
    cy.wait("@updateModel").then(({ response: { body, statusCode } }) => {
      expect(statusCode).not.to.eq(400);
      expect(body.errors).not.to.exist;
      expect(body.description).to.be.null;
    });
    cy.button("Save failed").should("not.exist");
  });
});
