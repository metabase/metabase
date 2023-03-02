import { restore } from "e2e/support/helpers";

describe("issue 20517", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/1").as("updateCard");

    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/card/1", { dataset: true });
  });

  it("should be able to save metadata changes with empty description (metabase#20517)", () => {
    cy.visit("/model/1/metadata");

    cy.findByLabelText("Description").clear().blur();

    cy.button("Save changes").click();

    cy.wait("@updateCard").then(({ response: { body, statusCode } }) => {
      expect(statusCode).not.to.eq(400);
      expect(body.errors).not.to.exist;
    });

    cy.button("Save failed").should("not.exist");
  });
});
