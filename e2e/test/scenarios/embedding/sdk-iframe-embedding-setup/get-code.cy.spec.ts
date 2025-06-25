import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";
import { enableSamlAuth } from "e2e/support/helpers/embedding-sdk-testing";

import { getEmbedSidebar, visitNewEmbedPage } from "./helpers";

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

      cy.findByLabelText("User Session")
        .should("be.visible")
        .should("be.checked");

      cy.findByLabelText("SSO Authentication")
        .should("be.visible")
        .should("not.be.checked");
    });
  });

  it("should disable SSO radio button when JWT and SAML are not configured", () => {
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.wait(["@getJwtConfigured", "@getSamlConfigured"]);
      cy.findByLabelText("SSO Authentication").should("be.disabled");
    });
  });

  it("should enable SSO radio button when JWT is configured", () => {
    enableJwtAuth();
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.wait(["@getJwtConfigured", "@getSamlConfigured"]);
      cy.findByLabelText("SSO Authentication").should("not.be.disabled");
    });
  });

  it("should enable SSO radio button when SAML is configured", () => {
    enableSamlAuth();
    navigateToGetCodeStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.wait(["@getJwtConfigured", "@getSamlConfigured"]);
      cy.findByLabelText("SSO Authentication").should("not.be.disabled");
    });
  });

  describe("Code Snippet Generation", () => {
    it("should display code snippet with syntax highlighting", () => {
      navigateToGetCodeStep({ experience: "dashboard" });

      getEmbedSidebar().within(() => {
        cy.findByText("Embed Code").should("be.visible");
        cy.get("[data-testid=code-editor]").should("be.visible");
        cy.get("[data-testid=code-editor]").should("contain", "MetabaseEmbed");
      });
    });

    it("should include useExistingUserSession when user session is selected", () => {
      navigateToGetCodeStep({ experience: "dashboard" });

      getEmbedSidebar().within(() => {
        cy.findByLabelText("User Session").should("be.checked");
        cy.get("[data-testid=code-editor]").should(
          "contain",
          "useExistingUserSession: true",
        );
      });
    });

    it("should not include useExistingUserSession when SSO is selected", () => {
      enableJwtAuth();
      navigateToGetCodeStep({ experience: "dashboard" });

      getEmbedSidebar().within(() => {
        cy.wait(["@getJwtConfigured", "@getSamlConfigured"]);
        cy.findByLabelText("SSO Authentication").click();
        cy.get("[data-testid=code-editor]").should(
          "not.contain",
          "useExistingUserSession",
        );
      });
    });

    it("should reflect dashboard settings in code snippet", () => {
      navigateToGetCodeStep({ experience: "dashboard" });

      getEmbedSidebar().within(() => {
        cy.get("[data-testid=code-editor]").should(
          "contain",
          '"type": "dashboard"',
        );
        cy.get("[data-testid=code-editor]").should(
          "contain",
          `"resourceId": ${ORDERS_DASHBOARD_ID}`,
        );
      });
    });

    it("should reflect question settings in code snippet", () => {
      navigateToGetCodeStep({ experience: "chart" });

      getEmbedSidebar().within(() => {
        cy.get("[data-testid=code-editor]").should(
          "contain",
          '"type": "question"',
        );
        cy.get("[data-testid=code-editor]").should(
          "contain",
          `"resourceId": ${ORDERS_COUNT_QUESTION_ID}`,
        );
      });
    });

    it("should handle exploration experience correctly", () => {
      visitNewEmbedPage();

      getEmbedSidebar().within(() => {
        cy.findByText("Exploration").click();

        navigateToGetCodeStep({ experience: "exploration" });

        cy.get("[data-testid=code-editor]").should(
          "contain",
          '"type": "question"',
        );
        cy.get("[data-testid=code-editor]").should(
          "contain",
          '"resourceId": "new"',
        );
      });
    });
  });
});

const navigateToGetCodeStep = ({
  experience,
}: {
  experience: "dashboard" | "chart" | "exploration";
}) => {
  cy.log("visit a resource to populate the activity log");
  if (experience === "dashboard") {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.wait("@dashboard");
  } else if (experience === "chart") {
    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
    cy.wait("@cardQuery");
  }

  visitNewEmbedPage();

  cy.log("select an experience");
  if (experience === "chart") {
    cy.findByText("Chart").click();
  } else if (experience === "exploration") {
    cy.findByText("Exploration").click();
  }

  cy.log("navigate to the get code step");
  getEmbedSidebar().within(() => {
    // Skip entity selection for exploration
    if (experience !== "exploration") {
      cy.findByText("Next").click();
    }

    cy.findByText("Next").click(); // Configure embed options step
    cy.findByText("Get Code").click(); // Get code step
  });
};
