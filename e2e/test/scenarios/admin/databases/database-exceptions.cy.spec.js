import { restore, typeAndBlurUsingLabel, isEE } from "e2e/support/helpers";

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

  it("should show error upon a bad request", () => {
    cy.intercept("POST", "/api/database", req => {
      req.reply({
        statusCode: 400,
        body: "DATABASE CONNECTION ERROR",
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

  it("should handle a failure to `GET` the list of all databases (metabase#20471)", () => {
    const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

    cy.intercept(
      {
        method: "GET",
        pathname: "/api/database",
        query: isEE
          ? {
              exclude_uneditable_details: "true",
            }
          : null,
      },
      req => {
        req.reply({
          statusCode: 500,
          body: { message: errorMessage },
        });
      },
    ).as("failedGet");

    cy.visit("/admin/databases");
    cy.wait("@failedGet");

    cy.findByRole("heading", { name: "Something's gone wrong" });
    cy.findByText(
      "We've run into an error. You can try refreshing the page, or just go back.",
    );

    cy.findByText(errorMessage).should("not.be.visible");
    cy.findByText("Show error details").click();
    cy.findByText(errorMessage).should("be.visible");
  });
});
