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

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > get code step";

H.describeWithSnowplow(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should select user session auth method by default", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      cy.findByText("Authentication").should("be.visible");
      cy.findByText("Choose the authentication method for embedding:").should(
        "be.visible",
      );

      cy.findByLabelText("Existing Metabase Session")
        .should("be.visible")
        .should("be.checked");

      cy.findByLabelText("Single sign-on (SSO)")
        .should("be.visible")
        .should("not.be.checked");
    });
  });

  it("should disable SSO radio button when JWT and SAML are not configured", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on (SSO)").should("be.disabled");
    });
  });

  it("should enable SSO radio button when JWT is configured", () => {
    enableJwtAuth();
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on (SSO)").should("not.be.disabled");
    });
  });

  it("should enable SSO radio button when SAML is configured", () => {
    enableSamlAuth();
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on (SSO)").should("not.be.disabled");
    });
  });

  it("should display code snippet with syntax highlighting", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      cy.findByText("Embed Code").should("be.visible");
      codeBlock().should("be.visible");
      codeBlock().should("contain", "defineMetabaseConfig");
      codeBlock().should("contain", "metabase-dashboard");
    });
  });

  it("should include useExistingUserSession when user session is selected", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Existing Metabase Session").should("be.checked");
      codeBlock().should("contain", '"useExistingUserSession": true');
    });
  });

  it("should not include useExistingUserSession when SSO is selected", () => {
    enableJwtAuth();
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on (SSO)").click();

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_auth_selected",
        event_detail: "sso",
      });

      codeBlock().should("not.contain", "useExistingUserSession");
    });
  });

  it("should set dashboard-id for dashboard experience", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    getEmbedSidebar().within(() => {
      codeBlock().should("contain", `dashboard-id="${ORDERS_DASHBOARD_ID}"`);
    });
  });

  it("should set question-id for chart experience", () => {
    navigateToGetCodeStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
    });

    getEmbedSidebar().within(() => {
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
});
