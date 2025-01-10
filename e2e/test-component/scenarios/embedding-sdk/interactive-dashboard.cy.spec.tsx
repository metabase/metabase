import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { describeEE } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { Stack } from "metabase/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

describeEE("scenarios > embedding-sdk > interactive-dashboard", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createDashboardWithQuestions({
      dashboardName: "Orders Dashboard",
      questions: [
        {
          name: "My Orders",
          query: { "source-table": ORDERS_ID, limit: 5 },
        },
      ],
      cards: [{ size_x: 8, col: 0 }],
    }).then(({ dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
    });

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
      cy.contains("Orders Dashboard").should("be.visible");
      cy.findByText("My Orders").click();
      cy.contains("My Orders").should("be.visible");
      cy.contains("This is a custom question layout.");
    });
  });
});
