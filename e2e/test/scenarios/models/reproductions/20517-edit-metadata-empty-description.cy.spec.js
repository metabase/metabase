import { restore } from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

describe("issue 20517", () => {
  beforeEach(() => {
    cy.intercept("PUT", `/api/card${ORDERS_QUESTION_ID}`).as("updateCard");

    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/card${ORDERS_QUESTION_ID}`, { dataset: true });
  });

  it("should be able to save metadata changes with empty description (metabase#20517)", () => {
    cy.visit(`/model/${ORDERS_QUESTION_ID}/metadata`);

    cy.findByLabelText("Description").clear().blur();

    cy.button("Save changes").click();

    cy.wait("@updateCard").then(({ response: { body, statusCode } }) => {
      expect(statusCode).not.to.eq(400);
      expect(body.errors).not.to.exist;
    });

    cy.button("Save failed").should("not.exist");
  });
});
