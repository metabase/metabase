import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import { getEmbedSidebar, navigateToEntitySelectionStep } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("persists dashboard embed options", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("1. set embed settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").click().should("be.checked");

      capturePersistSettings();

      cy.findByLabelText("Show dashboard title")
        .click()
        .should("not.be.checked");
    });

    cy.log("2. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Dashboard").should("be.checked");
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("3. persisted settings should be restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show dashboard title").should("not.be.checked");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });
  });

  it("persists chart embed options", () => {
    navigateToEmbedOptionsStep({ experience: "chart" });

    cy.log("1. set chart embed settings to non-default values");
    getEmbedSidebar().within(() => {
      capturePersistSettings();
      cy.findByLabelText("Allow downloads").click().should("be.checked");
      cy.wait("@persistSettings");

      capturePersistSettings();
      cy.findByLabelText("Show chart title").click().should("not.be.checked");
    });

    cy.log("2. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Chart").should("be.checked");
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("3. verify persisted settings are restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show chart title").should("not.be.checked");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });
  });

  it("persists exploration embed options", () => {
    navigateToEmbedOptionsStep({ experience: "exploration" });

    cy.log("1. set exploration settings to non-default values");
    capturePersistSettings();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to save new questions")
        .click()
        .should("not.be.checked");
    });

    H.getIframeBody().findByText("Save").should("not.exist");

    cy.log("2. reload the page");
    waitAndReload();

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Exploration").should("be.checked");
      cy.findByText("Next").click(); // Embed options step

      cy.log("3. persisted settings should be restored");
      cy.findByLabelText("Allow users to save new questions").should(
        "not.be.checked",
      );
    });
  });

  it("persists brand colors", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("1. change brand color to red");
    cy.findByLabelText("#509EE3").click();

    H.popover().within(() => {
      capturePersistSettings();

      cy.findByDisplayValue("#509EE3")
        .should("be.visible")
        .clear()
        .type("rgb(255, 0, 0)")
        .blur();
    });

    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    cy.log("2. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("3. brand color should be persisted");
    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");
  });

  it("persists sso auth method", () => {
    enableJwtAuth();
    navigateToGetCodeStep({ experience: "dashboard" });

    cy.log("1. select sso auth method");
    getEmbedSidebar().within(() => {
      capturePersistSettings();

      cy.findByLabelText("Single sign-on (SSO)")
        .should("not.be.disabled")
        .click()
        .should("be.checked");

      codeBlock().should("not.contain", "useExistingUserSession");
    });

    cy.log("2. reload the page");
    waitAndReload();
    navigateToGetCodeStep({ experience: "dashboard" });

    cy.log("3. auth method should persist");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Existing Metabase Session").should("not.be.checked");
      cy.findByLabelText("Single sign-on (SSO)").should("be.checked");
      codeBlock().should("not.contain", "useExistingUserSession");
    });
  });
});

const navigateToEmbedOptionsStep = ({
  experience,
}: {
  experience: "dashboard" | "chart" | "exploration";
}) => {
  navigateToEntitySelectionStep({ experience });

  getEmbedSidebar().within(() => {
    cy.findByText("Next").click(); // Embed options step
  });
};

const navigateToGetCodeStep = ({
  experience,
}: {
  experience: "dashboard" | "chart" | "exploration";
}) => {
  navigateToEntitySelectionStep({ experience });

  getEmbedSidebar().within(() => {
    cy.findByText("Next").click(); // Embed options step
    cy.findByText("Get Code").click(); // Get code step
  });
};

const codeBlock = () => cy.get(".cm-content");

// We must capture at the last embed options to change,
// otherwise we'd miss the last PUT request.
const capturePersistSettings = () => {
  cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings").as(
    "persistSettings",
  );
};

const waitAndReload = () => {
  cy.wait("@persistSettings").then(() => {
    // Reduce flakiness by waiting for settings to be saved.
    cy.wait(1000);

    cy.reload();
  });
};
