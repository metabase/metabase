import { restore, describeEE, isOSS } from "e2e/support/helpers";

describe("scenarios > admin > databases > list", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("OSS", { tags: "@OSS" }, () => {
    it("should not display error messages upon a failed `GET` (metabase#20471)", () => {
      cy.onlyOn(isOSS);

      const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

      cy.intercept(
        {
          method: "GET",
          pathname: "/api/database",
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
      // Not sure how exactly is this going the be fixed, but we should't show the full error message on the page in any case
      cy.findByText(errorMessage).should("not.be.visible");
    });
  });

  describeEE("EE", () => {
    it("should not display error messages upon a failed `GET` (metabase#20471)", () => {
      const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

      cy.intercept(
        {
          method: "GET",
          pathname: "/api/database",
          query: {
            exclude_uneditable_details: "true",
          },
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
      // Not sure how exactly is this going the be fixed, but we should't show the full error message on the page in any case
      cy.findByText(errorMessage).should("not.be.visible");
    });
  });

  it("should let you see databases in list view", () => {
    cy.visit("/admin/databases");
    cy.findByText("Sample Database");
    cy.findByText("H2");
  });

  it("should not let you see saved questions in the database list", () => {
    cy.visit("/admin/databases");
    cy.get("tr").should("have.length", 2);
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
    cy.button("Remove this database");
  });
});
