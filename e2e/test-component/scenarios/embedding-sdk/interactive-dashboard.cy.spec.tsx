import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { describeEE, popover, POPOVER_ELEMENT } from "e2e/support/helpers";
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

    const questionCard = {
      id: 64,
      card_id: ORDERS_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 8,
      size_y: 8,
    };

    const questionCardWithClickBehavior = {
      ...questionCard,
      id: 65,
      col: 8,
      visualization_settings: {
        click_behavior: {
          type: "link",
          linkType: "url",
          linkTemplate: "https://metabase.com",
        },
      },
    };

    cy.createDashboard(
      {
        name: "Orders in a dashboard",
        dashcards: [questionCard, questionCardWithClickBehavior],
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

  it.only("should not trigger url click behaviors when clicking on cards (metabase#51099)", () => {
    cy.get<string>("@dashboardId").then(dashboardId => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery").then(() => {
      cy.location().then(location => {
        cy.wrap(location.pathname).as("initialPath");
      });

      getSdkRoot().within(() => {
        const dashcards = cy.findAllByTestId("dashcard");
        dashcards.should("have.length", 2);

        // Drill-through should work on cards without click behavior
        dashcards.eq(0).findAllByTestId("cell-data").eq(1).click();
        popover().should("contain.text", "View details");

        // Click on the second card with url click behavior
        cy.findAllByTestId("dashcard")
          .eq(1)
          .findAllByTestId("cell-data")
          .eq(1)
          .click();

        // Drill-through should not activate on cards with url click behavior
        cy.get(POPOVER_ELEMENT).should("not.exist");

        // We should not be navigated away from the current page
        cy.location().then(location => {
          cy.get("@initialPath").should("eq", location.pathname);
        });
      });
    });
  });
});
