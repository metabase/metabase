import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > databases > list", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.server();
  });

  it("should let you see databases in list view", () => {
    cy.visit("/admin/databases");
    cy.findByText("Sample Database");
    cy.findByText("H2");
  });

  it("should not let you see saved questions in the database list", () => {
    cy.visit("/admin/databases");
    cy.get("td").should("have.length", 3);
  });

  it("should let you view a database's detail view", () => {
    cy.visit("/admin/databases");
    cy.contains("Sample Database").click();
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
    cy.contains("Sample Database").click();
    cy.url().should("match", /\/admin\/databases\/1$/);
  });

  it("should let you delete a database", () => {
    cy.route("DELETE", "/api/database/1").as("delete");

    cy.visit("/admin/databases");
    cy.get("table").should("contain", "Sample Database");

    cy.contains("Sample Database")
      .closest("tr")
      .contains("Delete")
      .click();
    cy.get(".ModalBody input").type("DELETE");
    cy.get(".ModalBody")
      .contains("button", "Delete")
      .should("be.disabled");
    cy.get(".ModalBody input")
      .clear()
      .type("Sample Database");

    cy.get(".ModalBody")
      .contains("button", "Delete")
      .click();
    cy.wait("@delete");

    cy.get("table").should("not.contain", "Sample Database");
  });

  it("should let you bring back the sample database", () => {
    cy.route("POST", "/api/database/sample_database").as("sample_database");

    cy.request("DELETE", "/api/database/1").as("delete");
    cy.visit("/admin/databases");
    cy.contains("Bring the sample database back").click();
    cy.wait("@sample_database");
    cy.contains("Sample Database").click();
    cy.url().should("match", /\/admin\/databases\/\d+$/);
  });

  it("should display a deprecated database warning", () => {
    cy.intercept(/\/api\/database$/, req => {
      req.reply(res => {
        res.body.data = res.body.data.map(database => ({
          ...database,
          engine: "presto",
        }));
      });
    });

    cy.visit("/admin");

    cy.findByRole("status").within(() => {
      cy.findByText("Database driver");
      cy.findByText(/which is now deprecated/);
      cy.findByText("Database driver").click();
    });

    cy.findByRole("table").within(() => {
      cy.findByText("Sample Database");
    });

    cy.findByRole("status").within(() => {
      cy.findByLabelText("close icon").click();
    });

    cy.findByRole("status").should("not.exist");
  });
});
