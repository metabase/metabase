import {
  describeEE,
  modal,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";

describe("scenarios > admin > settings > scim", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describeEE("settings management", () => {
    beforeEach(() => {
      setTokenFeatures("all");
    });

    it("should be able to setup and manage scim feature", () => {
      cy.visit("/admin/settings/authentication");

      cy.log("can go to user provisioning tab");
      authTab("User Provisioning").should("exist");
      authTab("User Provisioning").click();
      cy.url().should(
        "include",
        "/admin/settings/authentication/user-provisioning",
      );

      cy.log("can enable scim");
      scimToggle().should("exist");
      scimToggle().click();

      cy.wait(1000);

      let initialUnmaskedToken = "";
      cy.log("should show unmasked info in modal");
      modal().within(() => {
        cy.findByText("Here's what you'll need to set SCIM up").should("exist");
        scimEndpointInput().invoke("val").should("contain", "/api/ee/scim/v2");
        scimTokenInput()
          .invoke("val")
          .should("not.contain", "****************************************");
        // save to compare with masked token
        scimTokenInput()
          .invoke("val")
          .then(val => (initialUnmaskedToken = String(val)));
        cy.findAllByRole("button", { name: /Done/ }).click();
      });

      cy.log(
        "should show masked info in main page + should match unmasked token",
      );
      scimEndpointInput()
        .should("exist")
        .invoke("val")
        .should("contain", "/api/ee/scim/v2");

      scimTokenInput()
        .invoke("val")
        .should("contain", "mb_")
        .should("contain", "****************************************")
        .then(val => expect(val).to.contain(initialUnmaskedToken.slice(0, 7)));

      cy.log("should be able to regenerate a token");
      cy.findByRole("button", { name: /Regenerate/ }).click();

      modal().within(() => {
        cy.findByText("Regenerate token?").should("exist");
        cy.findByRole("button", { name: /Regenerate now/ }).click();
      });

      let regeneratedToken = "";
      modal().within(() => {
        cy.findByText("Copy and save the SCIM token").should("exist");
        scimTokenInput()
          .invoke("val")
          .should("not.contain", "Loading")
          .should("not.contain", "****************************************")
          .then(val => (regeneratedToken = String(val)));
        cy.findByRole("button", { name: /Done/ }).click();
      });

      scimTokenInput()
        .invoke("val")
        .should("contain", "mb_")
        .should("contain", "****************************************")
        .then(val => expect(val).to.contain(regeneratedToken.slice(0, 7)));

      cy.log("should be able to cancel regenerating a token");
      cy.findByRole("button", { name: /Regenerate/ }).click();

      modal().within(() => {
        cy.findByText("Regenerate token?").should("exist");
        cy.findByRole("button", { name: /Cancel/ }).click();
      });
      modal().should("not.exist");

      scimTokenInput()
        .invoke("val")
        .should("contain", "mb_")
        .should("contain", "****************************************")
        .then(val => expect(val).to.contain(regeneratedToken.slice(0, 7)));

      cy.log("should be able to disable scim and info stay");
      scimToggle().click();
      scimToggle().should("not.be.checked");
      scimEndpointInput().should("be.visible");
      scimTokenInput().should("be.visible");
      cy.findByRole("button", { name: /Regenerate/ }).should("be.disabled");

      cy.log("should be able to re-enable");
      scimToggle().click();
      scimToggle().should("be.checked");
    });
  });
});

function authTab(name: string) {
  return cy.findByRole("tab", { name });
}

function scimToggle() {
  // TODO: make better selector
  return cy.get("#scim-enabled");
}

function scimEndpointInput() {
  return cy.findByLabelText("SCIM endpoint URL");
}

function scimTokenInput() {
  return cy.findByLabelText("SCIM token");
}
