import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { describeEE } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeEE("scenarios > embedding-sdk > tooltip-reproductions", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createQuestion({
      name: "Tooltip test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "bar",
    })
      .then(({ body: { id: ordersQuestionId } }) =>
        H.createDashboard({
          dashcards: [
            {
              id: 1,
              size_x: 10,
              size_y: 50,
              row: 0,
              col: 0,
              card_id: ordersQuestionId,
            },
            {
              id: 2,
              size_x: 10,
              size_y: 10,
              row: 0,
              col: 0,
              card_id: ordersQuestionId,
            },
          ],
        }),
      )
      .then(dashboard => {
        cy.wrap(dashboard.body.id).as("dashboardId");
      });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should render tooltips below the screen's height ()", () => {
    cy.get("@dashboardId").then(dashboardId => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);

      cy.scrollTo("bottom");

      H.getDashboardCard(1).within(() => {
        H.echartsTriggerBlur();
        cy.wait(50);
        H.chartPathWithFillColor("#509EE3").eq(0).realHover();
      });

      H.echartsTooltip().findByText("Count").should("be.visible");
    });
  });
});
