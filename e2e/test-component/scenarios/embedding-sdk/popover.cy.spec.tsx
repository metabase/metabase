import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import * as H from "e2e/support/helpers";
import { openVizSettingsSidebar } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > popovers", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    signInAsAdminAndEnableEmbeddingSdk();

    H.createDashboardWithQuestions({
      questions: [
        {
          name: "vertical legend with popover",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "temporal-unit": "year", "base-type": "type/DateTime" },
              ],
              [
                "field",
                PEOPLE.STATE,
                { "source-field": ORDERS.USER_ID, "base-type": "type/Text" },
              ],
            ],
          },
          visualization_settings: {
            "graph.dimensions": ["CREATED_AT", "STATE"],
            "graph.metrics": ["count"],
          },
        },
      ],
      cards: [{ col: 0, row: 0, size_x: 24, size_y: 6 }],
    }).then(({ dashboard }) => cy.wrap(dashboard.id).as("dashboardId"));

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should show legend overflow popover for charts with many series (metabase#57131)", () => {
    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery");

    getSdkRoot().within(() => {
      cy.log("click on the legend overflow");
      cy.findByText("And 39 more").click();
    });

    cy.log("check that the popover is showing chart legends");
    H.popover().findByText("IA").should("be.visible");
    H.popover().findByText("ID").should("be.visible");
  });

  it("should prevent closing the ChartSettingColorPicker when clicking it", () => {
    mountSdkContent(
      <InteractiveQuestion questionId={ORDERS_BY_YEAR_QUESTION_ID} />,
    );

    openVizSettingsSidebar();

    getSdkRoot().within(() => {
      cy.findByTestId("color-selector-button").click();

      // Clicking at the edge of the color picker popover to be sure that the click does not close it
      cy.findByTestId("color-selector-popover").click(1, 1);
      cy.findByTestId("color-selector-popover").should("be.visible");

      // Clicking outside the color picker to be sure that the click closes it
      cy.findByTestId("chartsettings-sidebar").click(1, 1);
      cy.findByTestId("color-selector-popover").should("not.exist");

      cy.findByTestId("settings-count").click();

      cy.findByTestId("series-settings").within(() => {
        cy.findByTestId("color-selector-button").click();

        // Clicking at the edge of the color picker popover to be sure that the click does not close it
        cy.findByTestId("color-selector-popover").click(1, 1);
        cy.findByTestId("color-selector-popover").should("be.visible");
      });
    });
  });
});
