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
});
