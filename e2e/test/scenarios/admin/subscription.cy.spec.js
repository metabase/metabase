import { restore, mockSessionProperty } from "e2e/support/helpers";

describe("banner", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("Show a banner when the subscription payment status is `past-due`", () => {
    mockSessionProperty("token-status", {
      status: "past-due",
      valid: false,
      trial: false,
      features: [],
    });

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("We couldn't process payment for your account.");
    cy.visit("/admin/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("We couldn't process payment for your account.");

    cy.signInAsNormalUser();
    cy.visit("/");
    // Wait for page to load
    cy.get("header");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("We couldn't process payment for your account.").should(
      "not.exist",
    );
  });

  it("Show a banner when the subscription payment status is `unpaid`", () => {
    mockSessionProperty("token-status", {
      status: "unpaid",
      valid: false,
      trial: false,
      features: [],
    });

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pro features won’t work right now due to lack of payment.");
    cy.visit("/admin/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pro features won’t work right now due to lack of payment.");

    cy.signInAsNormalUser();
    cy.visit("/");
    // Wait for page to load
    cy.get("header");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(
      "Pro features won’t work right now due to lack of payment.",
    ).should("not.exist");
  });
});
