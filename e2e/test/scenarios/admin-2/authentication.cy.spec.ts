import {
  describeEE,
  main,
  modal,
  onlyOnOSS,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";

import { setupSaml } from "./sso/shared/helpers.js";

describe("scenarios > admin > settings > authentication", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("page layout", () => {
    describe("oss", { tags: "@OSS" }, () => {
      it("should implement a tab layout for oss customers", () => {
        onlyOnOSS();

        cy.visit("/admin/settings/authentication");

        cy.log(
          "should have the api keys as a auth card (and should be able to access the page)",
        );
        cy.findByTestId("api-keys-setting").should("exist");

        cy.log("should show an upsell");
        cy.findByTestId("upsell-card").should("exist");

        cy.log("should not have tabs");
        // no tabs on authentication page
        cy.findByRole("tab").should("not.exist");
        // no tabs on api keys
        cy.visit("/admin/settings/authentication/api-keys");
        main().within(() => {
          cy.findByText("Manage API Keys");
        });
        cy.findByRole("tab").should("not.exist");
      });
    });

    describeEE("ee", () => {
      it("should implement a tab layout for enterprise customers", () => {
        setTokenFeatures("all");

        cy.visit("/admin/settings/authentication");

        authTab("Authentication")
          .should("exist")
          .should("have.attr", "data-active", "true");
        authTab("User Provisioning").should("exist");
        authTab("API Keys").should("exist");

        cy.log("should not upsell enterprise customer");
        cy.findByTestId("upsell-card").should("not.exist");

        cy.log("should not show api keys under authentication tab");
        cy.findByTestId("api-keys-setting").should("not.exist");

        cy.log("should be able to go to the user provisioning page via a tab");
        authTab("User Provisioning").click();
        authTab("User Provisioning").should("have.attr", "data-active", "true");
        cy.url().should(
          "include",
          "/admin/settings/authentication/user-provisioning",
        );

        cy.log("should be able to go to the api keys page via a tab");
        authTab("API Keys").click();
        authTab("API Keys").should("have.attr", "data-active", "true");
        cy.url().should("include", "/admin/settings/authentication/api-keys");
      });
    });
  });
});

describe("scenarios > admin > settings > user provisioning", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("oss", { tags: "@OSS" }, () => {
    it("user provisioning page should not be availble for OSS customers", () => {
      onlyOnOSS();
      cy.visit("/admin/settings/authentication/user-provisioning");
      main().within(() => {
        cy.findByText("We're a little lost...");
      });
    });
  });

  describeEE("scim settings management", () => {
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

      cy.log(
        "should not show endpoint and token inputs if scim has never been enabled before",
      );
      main().within(() => {
        scimEndpointInput().should("not.exist");
        scimTokenInput().should("not.exist");
      });

      cy.log("can enable scim");
      scimToggle().should("exist");
      scimToggle().click();

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

    it("should warn users that saml user provisioning will be disabled before enabling scim", () => {
      setupSaml();
      cy.visit("/admin/settings/authentication/user-provisioning");

      const samlWarningMessage =
        "When enabled, SAML user provisioning will be turned off in favor of SCIM.";

      main().within(() => {
        cy.log("message should exist while scim has never been enabled");
        cy.findByText(samlWarningMessage).should("exist");

        cy.log("message should not exist once scim has been enabled");
        scimToggle().should("not.be.checked");
        scimToggle().click();
        scimToggle().should("be.checked");
      });

      modal().within(() => {
        cy.findByRole("button", { name: /Done/ }).click();
      });

      main().within(() => {
        cy.findByText(samlWarningMessage).should("not.exist");

        cy.log(
          "message should still not exist even after scim has been disabled",
        );
        scimToggle().click();
        scimToggle().should("not.be.checked");
        cy.findByText(samlWarningMessage).should("not.exist");
      });
    });

    it("should properly handle errors", () => {
      cy.log("should show error when scim token fails to load");
      cy.intercept("GET", "/api/ee/scim/api_key", { statusCode: 500 });
      cy.visit("/admin/settings/authentication/user-provisioning");
      main().within(() => {
        cy.findByText("Error fetching SCIM token");
      });

      cy.log(
        "should show error when scim token fails to generate when scim is enabled",
      );
      // enable scim and stop mocking get scim api key request
      cy.intercept("GET", "/api/ee/scim/api_key", req => {
        req.continue();
      });
      cy.request("PUT", "api/setting/scim-enabled", { value: true });
      cy.visit("/admin/settings/authentication/user-provisioning");
      main().within(() => {
        cy.findByText("Token failed to generate, please regenerate one.");
      });

      cy.log("should show error when scim token fails to regenerate");
      cy.intercept("POST", "/api/ee/scim/api_key", {
        statusCode: 500,
        body: { message: "An error occurred" },
      });
      cy.findByRole("button", { name: /Regenerate/ }).click();

      modal().within(() => {
        cy.findByText("Regenerate token?").should("exist");
        cy.findByRole("button", { name: /Regenerate now/ }).click();
      });

      modal().within(() => {
        cy.findByText("An error occurred");
      });
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
