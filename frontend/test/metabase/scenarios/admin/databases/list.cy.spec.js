import { signInAsAdmin, restore } from "__support__/cypress";

describe("scenarios > admin > databases > list", () => {
  before(restore);

  beforeEach(() => {
    signInAsAdmin();
    cy.server();
  });

  it("should let you see databases in list view", () => {
    cy.visit("/admin/databases");
    cy.findByText("Sample Dataset");
    cy.findByText("H2");
  });

  it("should not let you see saved questions in the database list", () => {
    cy.visit("/admin/databases");
    cy.get("td").should("have.length", 3);
  });

  it("should let you view a database's detail view", () => {
    cy.visit("/admin/databases");
    cy.contains("Sample Dataset").click();
    cy.url().should("match", /\/admin\/databases\/\d+$/);
  });

  it("should let you add a database", () => {
    cy.visit("/admin/databases");
    cy.contains("Add database").click();
    cy.url().should("match", /\/admin\/databases\/create$/);
    // *** code here should be more thorough
  });

  it("should let you access edit page a database", () => {
    cy.visit("/admin/databases");
    cy.contains("Sample Dataset").click();
    cy.url().should("match", /\/admin\/databases\/1$/);
  });

  it("should let you delete a database", () => {
    cy.route("DELETE", "/api/database/1").as("delete");

    cy.visit("/admin/databases");
    cy.get("table").should("contain", "Sample Dataset");

    cy.contains("Sample Dataset")
      .closest("tr")
      .contains("Delete")
      .click();
    cy.get(".ModalBody input").type("DELETE");
    cy.get(".ModalBody")
      .contains("button", "Delete")
      .click();
    cy.wait("@delete");

    cy.get("table").should("not.contain", "Sample Dataset");
  });

  it("should let you bring back the sample dataset", () => {
    cy.route("POST", "/api/database/sample_dataset").as("sample_dataset");

    cy.visit("/admin/databases");
    cy.contains("Bring the sample dataset back").click();
    cy.wait("@sample_dataset");
    cy.contains("Sample Dataset").click();
    cy.url().should("match", /\/admin\/databases\/\d+$/);
  });
});
