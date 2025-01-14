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

    const textCard = getTextCardDetails({ col: 16, text: "Test text card" });
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

    cy.createDashboard({
      name: "Embedding SDK Test Dashboard",
      dashcards: [questionCard, textCard],
    }).then(({ body: dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      cy.wrap(dashboard.entity_id).as("dashboardEntityId");
    });

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
      cy.findByText("Embedding SDK Test Dashboard").should("be.visible"); // dashboard title

      cy.findByText("Test text card").should("be.visible"); // text card content

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

  describe("loading behavior for both entity IDs and number IDs (metabase#49581)", () => {
    const successTestCases = [
      {
        name: "correct entity ID",
        dashboardIdAlias: "@dashboardEntityId",
      },
      {
        name: "correct number ID",
        dashboardIdAlias: "@dashboardId",
      },
    ];

    const failureTestCases = [
      {
        name: "wrong entity ID",
        dashboardId: "VFCGVYPVtLzCtt4teeoW4",
      },
      {
        name: "one too many entity ID character",
        dashboardId: "VFCGVYPVtLzCtt4teeoW49",
      },
      {
        name: "wrong number ID",
        dashboardId: 9999,
      },
    ];

    successTestCases.forEach(({ name, dashboardIdAlias }) => {
      it(`should load dashboard content for ${name}`, () => {
        cy.get(dashboardIdAlias).then(dashboardId => {
          mountSdkContent(<StaticDashboard dashboardId={dashboardId} />);
        });

        getSdkRoot().within(() => {
          cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
          cy.findByText("Test question card").should("be.visible");
          cy.findByText("Rows 1-6 of first 2000").should("be.visible");
          cy.findByText("Test text card").should("be.visible");
        });
      });
    });

    failureTestCases.forEach(({ name, dashboardId }) => {
      it(`should show an error message for ${name}`, () => {
        mountSdkContent(<StaticDashboard dashboardId={dashboardId} />);

        getSdkRoot().within(() => {
          const expectedErrorMessage = `Dashboard ${dashboardId} not found. Make sure you pass the correct ID.`;
          cy.findByRole("alert").should("have.text", expectedErrorMessage);

          cy.findByText("Orders in a dashboard").should("not.exist");
          cy.findByText("Orders").should("not.exist");
          cy.findByText("Rows 1-6 of first 2000").should("not.exist");
          cy.findByText("Test text card").should("not.exist");
        });
      });
    });
  });
});
