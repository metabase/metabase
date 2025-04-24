import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as H from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > popovers", () => {
  it("should show legend overflow popover for charts with many series (metabase#57131)", () => {
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
});
