import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";
import { enableSamlAuth } from "e2e/support/helpers/embedding-sdk-testing";

import { getEmbedSidebar, navigateToEntitySelectionStep } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > get code step", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  it("should select user session auth method by default", () => {
    navigateToGetCodeStep({ experience: "dashboard" });

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
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on (SSO)").should("be.disabled");
    });
  });

  it("should enable SSO radio button when JWT is configured", () => {
    enableJwtAuth();
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on (SSO)").should("not.be.disabled");
    });
  });

  it("should enable SSO radio button when SAML is configured", () => {
    enableSamlAuth();
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on (SSO)").should("not.be.disabled");
    });
  });

  it("should display code snippet with syntax highlighting", () => {
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByText("Embed Code").should("be.visible");
      codeBlock().should("be.visible");
      codeBlock().should("contain", "MetabaseEmbed");
    });
  });

  it("should include useExistingUserSession when user session is selected", () => {
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Existing Metabase Session").should("be.checked");
      codeBlock().should("contain", '"useExistingUserSession": true');
    });
  });

  it("should not include useExistingUserSession when SSO is selected", () => {
    enableJwtAuth();
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Single sign-on (SSO)").click();
      codeBlock().should("not.contain", "useExistingUserSession");
    });
  });

  it("should set dashboardId for dashboard experience", () => {
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      codeBlock().should("contain", `"dashboardId": ${ORDERS_DASHBOARD_ID}`);
    });
  });

  it("should set questionId for chart experience", () => {
    navigateToGetCodeStep({ experience: "chart" });

    getEmbedSidebar().within(() => {
      codeBlock().should(
        "contain",
        `"questionId": ${ORDERS_COUNT_QUESTION_ID}`,
      );
    });
  });

  it("should set template=exploration for exploration experience", () => {
    navigateToGetCodeStep({ experience: "exploration" });

    getEmbedSidebar().within(() => {
      codeBlock().should("contain", '"template": "exploration"');
    });
  });
});

const navigateToGetCodeStep = ({
  experience,
}: {
  experience: "dashboard" | "chart" | "exploration";
}) => {
  navigateToEntitySelectionStep({ experience });

  cy.log("navigate to get code step");

  getEmbedSidebar().within(() => {
    cy.findByText("Next").click(); // Configure embed options step
    cy.findByText("Get Code").click(); // Get code step
  });
};

const codeBlock = () => cy.get(".cm-content");
