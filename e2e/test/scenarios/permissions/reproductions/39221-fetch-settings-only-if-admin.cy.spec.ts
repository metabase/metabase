import { restore, openReviewsTable } from "e2e/support/helpers";

describe("issue 39221", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/setting").as("siteSettings");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");

    restore();
  });

  ["admin", "normal"].forEach(user => {
    it(`${user.toUpperCase()}: updating user-specific setting should not result in fetching all site settings (metabase#39221)`, () => {
      cy.signOut();
      cy.signIn(user as "admin" | "normal");
      openReviewsTable({ mode: "notebook" });
      // Opening a SQL preview sidebar will trigger a user-local setting update
      cy.findByLabelText("View the SQL").click();

      cy.wait("@sessionProperties");

      cy.get("@siteSettings").should("be.null");
    });
  });
});
