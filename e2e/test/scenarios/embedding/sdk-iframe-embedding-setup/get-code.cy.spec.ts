import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";
import { enableSamlAuth } from "e2e/support/helpers/embedding-sdk-testing";

import { codeBlock, getEmbedSidebar, navigateToGetCodeStep } from "./helpers";

const { H } = cy;

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";

describe("scenarios > embedding > sdk iframe embed setup > get code step", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");

    H.mockEmbedJsToDevServer();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should disable SSO radio button (and show info message) when JWT and SAML are not configured", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on").should("be.disabled");
      cy.findByLabelText("Existing session (local testing only)").should(
        "be.enabled",
      );
      cy.findByLabelText("Existing session (local testing only)").should(
        "be.checked",
      );
      cy.findByText(/The code below will only work for local testing/).should(
        "be.visible",
      );
    });
  });

  it("should not display a warning when a user session is selected and JWT is configured", () => {
    enableJwtAuth();

    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Existing session (local testing only)").click();
      cy.findByText(/The code below will only work for local testing/).should(
        "not.exist",
      );
    });
  });

  it("should enable SSO radio button when JWT is configured", () => {
    enableJwtAuth();
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on").should("not.be.disabled");
    });
  });

  it("should enable SSO radio button when SAML is configured", () => {
    enableSamlAuth();
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on").should("not.be.disabled");
    });
  });

  it("should display code snippet with syntax highlighting", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      cy.findByText("Embed code").should("be.visible");
      codeBlock().should("be.visible");
      codeBlock().should("contain", "defineMetabaseConfig");
      codeBlock().should("contain", "metabase-dashboard");
    });
  });

  it("should include useExistingUserSession when user session is selected", () => {
    enableJwtAuth();
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      codeBlock().should("not.contain", '"useExistingUserSession": true');
      cy.findByLabelText("Existing session (local testing only)").click();
      codeBlock().should("contain", '"useExistingUserSession": true');

      cy.findByText(/Copy code/).click();

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_code_copied",
        event_detail:
          "experience=dashboard,snippetType=frontend,authSubType=user-session",
      });
    });
  });

  it("should track embed_wizard_code_copied when copy event triggers", () => {
    enableJwtAuth();
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      codeBlock().should("not.contain", '"useExistingUserSession": true');
      cy.findByLabelText("Existing session (local testing only)").click();
      codeBlock().should("contain", '"useExistingUserSession": true');

      codeBlock().trigger("copy");

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_code_copied",
        event_detail:
          "experience=dashboard,snippetType=frontend,authSubType=user-session",
      });
    });
  });

  it("should track embed_wizard_options_completed with settings=default properly (metabase#68285)", () => {
    navigateToGetCodeStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
    });

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });

  it("should not include useExistingUserSession when SSO is selected", () => {
    enableJwtAuth();

    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      codeBlock().should("not.contain", "useExistingUserSession");

      cy.findByText(/Copy code/).click();

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_code_copied",
        event_detail:
          "experience=dashboard,snippetType=frontend,authSubType=sso",
      });
    });
  });

  it("should set dashboard-id for regular dashboard experience", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      codeBlock().should("contain", `dashboard-id="${ORDERS_DASHBOARD_ID}"`);
    });
  });

  it("should set question-id for regular chart experience", () => {
    enableJwtAuth();
    navigateToGetCodeStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectSso: true,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Existing session (local testing only)").click();

      codeBlock().should(
        "contain",
        `question-id="${ORDERS_COUNT_QUESTION_ID}"`,
      );
    });
  });

  it("should use metabase-question for exploration experience", () => {
    navigateToGetCodeStep({ experience: "exploration" });

    getEmbedSidebar().within(() => {
      codeBlock().should("contain", "metabase-question");
    });
  });

  it("should not include entity-types when model count is 1", () => {
    cy.intercept("GET", "/api/search?limit=0&models=dataset", {
      data: [],
      total: 1,
    }).as("searchModels");

    navigateToGetCodeStep({ experience: "exploration" });

    cy.wait("@searchModels");

    getEmbedSidebar().within(() => {
      codeBlock().should("not.contain", "entity-types");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("Orders", { timeout: 20_000 }).should("be.visible");
      cy.findByText("Orders Model").should("be.visible");
    });
  });

  it("should include entity-types when model count is 3", () => {
    cy.intercept("GET", "/api/search?limit=0&models=dataset", {
      data: [],
      total: 3,
    }).as("searchModels");

    navigateToGetCodeStep({ experience: "exploration" });

    cy.wait("@searchModels");

    getEmbedSidebar().within(() => {
      codeBlock().should("contain", "entity-types='[\"model\"]'");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("Orders Model", { timeout: 20_000 }).should("be.visible");
      cy.findByText("Orders").should("not.exist");
    });
  });
});
