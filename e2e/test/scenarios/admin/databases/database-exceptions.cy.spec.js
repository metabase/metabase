import { restore, typeAndBlurUsingLabel } from "e2e/support/helpers";

describe("scenarios > admin > databases > exceptions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should handle malformed (null) database details (metabase#25715)", () => {
    cy.intercept("GET", "/api/database/1", req => {
      req.reply(res => {
        res.body.details = null;
      });
    }).as("loadDatabase");

    cy.visit("/admin/databases/1");
    cy.wait("@loadDatabase");

    // It is unclear how this issue will be handled,
    // but at the very least it shouldn't render the blank page.
    cy.get("nav").should("contain", "Metabase Admin");
    // The response still contains the database name,
    // so there's no reason we can't display it.
    cy.contains(/Sample Database/i);
    // This seems like a reasonable CTA if the database is beyond repair.
    cy.button("Remove this database").should("not.be.disabled");
  });

  it("should show error correctly on server error", () => {
    cy.intercept("POST", "/api/database", req => {
      req.reply({
        statusCode: 400,
        body: "DATABASE CONNECTION ERROR",
        delay: 1000,
      });
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeAndBlurUsingLabel("Display name", "Test");
    typeAndBlurUsingLabel("Database name", "db");
    typeAndBlurUsingLabel("Username", "admin");

    cy.button("Save").click();

    cy.wait("@createDatabase");
    cy.findByText("DATABASE CONNECTION ERROR").should("exist");
  });

  it("should handle non-existing databases (metabase#11037)", () => {
    cy.intercept("GET", "/api/database/999").as("loadDatabase");
    cy.visit("/admin/databases/999");
    cy.wait("@loadDatabase").then(({ response }) => {
      expect(response.statusCode).to.eq(404);
    });
    cy.findByText("Not found.");
    cy.findByRole("table").should("not.exist");
  });
});
