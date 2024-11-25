import { StaticDashboard } from "@metabase/embedding-sdk-react";

import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { describeEE, getTextCardDetails } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

describeEE("scenarios > embedding-sdk > static-dashboard", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    const textCard = getTextCardDetails({ col: 16, text: "Text text card" });
    const questionCard = {
      id: ORDERS_DASHBOARD_DASHCARD_ID,
      card_id: ORDERS_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 16,
      size_y: 8,
      visualization_settings: {
        "card.title": "Test question card",
      },
    };

    cy.createDashboard(
      {
        name: "Embedding Sdk Test Dashboard",
        dashcards: [questionCard, textCard],
      },
      { wrapId: true },
    );

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should render dashboard content", () => {
    cy.get<string>("@dashboardId").then(dashboardId => {
      mountSdkContent(<StaticDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@getDashboard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });

    getSdkRoot().within(() => {
      cy.findByText("Embedding Sdk Test Dashboard").should("be.visible"); // dashboard title

      cy.findByText("Text text card").should("be.visible"); // text card content

      cy.wait("@dashcardQuery");
      cy.findByText("Test question card").should("be.visible"); // question card content
    });
  });

  it("should show fullscreen mode control by default", () => {
    cy.get<string>("@dashboardId").then(dashboardId => {
      mountSdkContent(<StaticDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@getDashboard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });

    getSdkRoot().within(() => {
      cy.icon("expand").should("be.visible"); // enter full screen control
    });
  });
});
