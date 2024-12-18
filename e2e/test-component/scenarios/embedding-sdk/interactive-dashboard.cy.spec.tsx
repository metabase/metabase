import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

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
import { Stack } from "metabase/ui";

describeEE("scenarios > embedding-sdk > interactive-dashboard", () => {
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
    };

    cy.createDashboard(
      {
        name: "Orders in a dashboard",
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

  it("should be able to display custom question layout when clicking on dashboard cards", () => {
    cy.get<string>("@dashboardId").then(dashboardId => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          renderDrillThroughQuestion={() => (
            <Stack>
              <InteractiveQuestion.Title />
              <InteractiveQuestion.QuestionVisualization />
              <div>This is a custom question layout.</div>
            </Stack>
          )}
        />,
      );
    });

    getSdkRoot().within(() => {
      cy.contains("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders").click();
      cy.contains("Orders").should("be.visible");
      cy.contains("This is a custom question layout.");
    });
  });
});
