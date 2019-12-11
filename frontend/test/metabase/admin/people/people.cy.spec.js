import { signInAsAdmin } from "__support__/cypress";

describe("admin/people", () => {
  beforeEach(signInAsAdmin);

  describe("user management", () => {
    it("should render", () => {
      cy.visit("admin/people");
      cy.contains("People");
    });
    it("should allow admin to create new users", () => {
      cy.visit("admin/people");
      cy.contains("Add someone").click();
      cy.contains("First name")
        .next()
        .type("Testy");
      cy.contains("Last name")
        .next()
        .type("McTestface");
      // bit of a hack since there are multiple "Email" nodes
      cy.get("input[name='email']").type(
        `testy${Math.round(Math.random() * 100000)}@metabase.com`,
      );
      cy.contains("Create").click();
      cy.contains("has been added");
      cy.contains("Show").click();
      cy.contains("Done").click();
      cy.contains("Testy");
    });
  });
});
