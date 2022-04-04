import {
  restore,
  modal,
  describeEE,
  modifyPermission,
} from "__support__/e2e/cypress";

const SUBSCRIPTIONS_INDEX = 0;

describeEE("scenarios > admin > permissions > general", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("revoked permission", () => {
    beforeEach(() => {
      cy.visit("/admin/permissions/general");

      modifyPermission("All Users", SUBSCRIPTIONS_INDEX, "No");

      cy.button("Save changes").click();

      modal().within(() => {
        cy.findByText("Save permissions?");
        cy.findByText("Are you sure you want to do this?");
        cy.button("Yes").click();
      });

      cy.signInAsNormalUser();
    });

    it("revokes ability to create dashboard subscriptions", () => {
      cy.visit("/dashboard/1");
      cy.icon("subscription")
        .as("subscriptionsButton")
        .realHover();

      cy.findByText(
        "You don't have permission to create a subscription for this dashboard",
      );

      cy.get("@subscriptionsButton").click();
      cy.findByText("Create a dashboard subscription").should("not.exist");
    });

    it("revokes ability to create question alerts", () => {
      cy.visit("/question/1");
      cy.icon("bell")
        .as("subscriptionsButton")
        .realHover();
      cy.findByText(
        "You don't have permission to share data from this saved question",
      );

      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      ).should("not.exist");

      cy.get("@subscriptionsButton").click();
      cy.findByText("Create a dashboard subscription").should("not.exist");
    });
  });

  describe("granted permission", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("gives ability to create dashboard subscriptions", () => {
      cy.visit("/dashboard/1");
      cy.icon("subscription").click();
      cy.findByText("Create a dashboard subscription");
    });

    it("gives ability to create question alerts", () => {
      cy.visit("/question/1");
      cy.icon("bell").click();
      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      );
    });
  });
});
