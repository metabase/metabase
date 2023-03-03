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
    cy.contains("We couldn't process payment for your account.");
    cy.visit(`/admin/`);
    cy.contains("We couldn't process payment for your account.");

    cy.signInAsNormalUser();
    cy.visit("/");
    // Wait for page to load
    cy.get("header");
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
    cy.contains("Pro features won’t work right now due to lack of payment.");
    cy.visit(`/admin/`);
    cy.contains("Pro features won’t work right now due to lack of payment.");

    cy.signInAsNormalUser();
    cy.visit("/");
    // Wait for page to load
    cy.get("header");
    cy.contains(
      "Pro features won’t work right now due to lack of payment.",
    ).should("not.exist");
  });
});
