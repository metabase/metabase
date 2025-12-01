import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import {
  codeBlock,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
  navigateToGetCodeStep,
} from "./helpers";

const { H } = cy;

const DASHBOARD_NAME = "Orders in a dashboard";

describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings").as(
      "persistSettings",
    );
  });

  it("persists brand colors", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("1. change brand color to red");
    cy.findByTestId("brand-color-picker").findByRole("button").click();

    H.popover().within(() => {
      cy.findByDisplayValue("#509EE2")
        .should("be.visible")
        .clear()
        .type("rgb(255, 0, 0)")
        .blur();
    });

    H.getSimpleEmbedIframeContent()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    cy.log("2. reload the page");
    cy.wait("@persistSettings");

    cy.log("3. brand color should be persisted");
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.getSimpleEmbedIframeContent()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");
  });

  it("persists sso auth method", () => {
    enableJwtAuth();
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("1. select sso auth method");
    getEmbedSidebar().within(() => {
      cy.log("single sign on should not be checked by default");
      cy.findByLabelText("Single sign-on (SSO)")
        .should("not.be.checked")
        .click()
        .should("be.checked");

      codeBlock().should("not.contain", "useExistingUserSession");
    });

    cy.log("2. reload the page");
    cy.wait("@persistSettings");

    cy.log("3. auth method should persist");
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Existing Metabase session").should("not.be.checked");
      cy.findByLabelText("Single sign-on (SSO)").should("be.checked");
      codeBlock().should("not.contain", "useExistingUserSession");
    });
  });
});
