import { restore, signInAsAdmin } from "__support__/cypress";

describe("scenarios > admin > permissions", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should display error on failed save", () => {
    // revoke some permissions
    cy.visit("/admin/permissions/databases");
    cy.get(".Icon-sql")
      .last()
      .click();
    cy.contains("Revoke access").click();

    // stub out the PUT and save
    cy.server();
    cy.route({
      method: "PUT",
      url: /\/api\/permissions\/graph$/,
      status: 500,
      response: "Server error",
    });
    cy.contains("Save Changes").click();
    cy.contains("button", "Yes").click();

    // see error modal
    cy.contains("Server error");
    cy.contains("There was an error saving");
  });
});
