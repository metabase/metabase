import { signInAsAdmin, restore, main } from "__support__/cypress";

describe("scenarios > admin > people", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  var email = `testy${Math.round(Math.random() * 100000)}@metabase.com`;

  describe("user management", () => {
    it("should render", () => {
      cy.visit("/admin/people");
      main().within(() => {
        cy.findByText("People");
        cy.findByText("Groups");
      });
    });
    it("should allow admin to create new users", () => {
      cy.visit("/admin/people");
      cy.findByText("Add someone").click();

      // first modal
      cy.findByLabelText("First name").type("Testy");
      cy.findByLabelText("Last name").type("McTestface");
      // bit of a hack since there are multiple "Email" nodes
      cy.findByLabelText("Email").type(email);
      cy.findByText("Create").click();

      // second modal
      cy.findByText("Testy McTestface has been added");
      cy.findByText("Show").click();
      cy.findByText("Done").click();

      cy.findByText("Testy McTestface");
    });
    it("should disallow admin to create new users with case mutation of existing user", () => {
      cy.visit("/admin/people");
      cy.findByText("Add someone").click();

      // first modal
      cy.findByLabelText("First name").type("TestyNew");
      cy.findByLabelText("Last name").type("McTestfaceNew");
      // bit of a hack since there are multiple "Email" nodes
      cy.findByLabelText("Email").type(email.toUpperCase());
      cy.findByText("Create").click();
      cy.contains("Email address already in use.");

    });
  });
});
