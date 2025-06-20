import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as H from "e2e/support/helpers";
import { openVizSettingsSidebar } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { ConcreteFieldReference } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const ORDERS_TOTAL_FIELD: ConcreteFieldReference = [
  "field",
  ORDERS.TOTAL,
  {
    "base-type": "type/Float",
  },
];

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
            aggregation: [["count"], ["sum", ORDERS_TOTAL_FIELD]],
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
            "graph.metrics": ["count", "sum"],
          },
        },
      ],
      cards: [{ col: 0, row: 0, size_x: 24, size_y: 6 }],
    }).then(({ dashboard, questions }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      cy.wrap(questions[0].id).as("questionId");
    });

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

  it("should prevent closing the ChartSettingMultiSelect when clicking it", () => {
    cy.get<string>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />);
    });

    openVizSettingsSidebar();

    getSdkRoot().within(() => {
      cy.findByTestId("chartsettings-sidebar").findByText("Display").click();

      cy.findByTestId("chart-settings-widget-graph.tooltip_columns").within(
        () => {
          cy.findByTestId("multi-select").click();
          // Clicking at the edge of the multiselect popover to be sure that the click does not close it
          cy.get('[data-element-id="mantine-popover"]').click(2, 2);
          cy.get('[data-element-id="mantine-popover"]').should("be.visible");

          // Clicking outside of the multiselect popover to be sure that the click closes it
          cy.findByText("Additional tooltip columns").click();
          cy.get('[data-element-id="mantine-popover"]').should("be.hidden");
        },
      );
    });
  });
});
