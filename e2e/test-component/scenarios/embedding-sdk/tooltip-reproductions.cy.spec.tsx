import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { isFixedPositionElementVisible } from "e2e/support/helpers/e2e-element-visibility-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > tooltip-reproductions", () => {
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
              size_y: 20,
              row: 0,
              col: 0,
              card_id: ordersQuestionId,
            },
          ],
        }),
      )
      .then((dashboard) => {
        cy.wrap(dashboard.body.id).as("dashboardId");
      });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should have the correct tooltip position and z-index (metabase#51904, metabase#52732)", () => {
    const testCases = [
      // should use the user-supplied z-index
      { input: 1337, expected: 1338 },

      // should use the default z-index of 200
      { input: undefined, expected: 201 },
    ];

    testCases.forEach((zIndexTestCase) => {
      cy.get("@dashboardId").then((dashboardId) => {
        mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />, {
          sdkProviderProps: {
            theme: {
              components: { popover: { zIndex: zIndexTestCase.input } },
            },
          },
        });
      });

      H.getDashboardCard(0).within(() => {
        H.chartPathWithFillColor("#509EE3").eq(0).realHover();
      });

      cy.findAllByTestId("echarts-tooltip")
        .eq(0)
        .should("exist")
        .then(($tooltip) => {
          const tooltipElement = $tooltip[0];

          // a fixed-position tooltip should be visible
          expect(isFixedPositionElementVisible(tooltipElement)).to.be.true;

          const tooltipContainer = tooltipElement.closest(
            ".echarts-tooltip-container",
          );

          // tooltip container should exist
          expect(tooltipContainer).to.exist;

          const tooltipContainerStyle = window.getComputedStyle(
            tooltipContainer!,
          );

          // (metabase#51904): tooltip container must render above the fold in the Embedding SDK.
          // ensures that we are using fixed-positioned tooltips.
          expect(tooltipContainerStyle.position).to.equal("fixed");

          // (metabase#52732): tooltip container must have the user-supplied z-index
          // prevents the tooltip from being rendered below charts.
          expect(Number(tooltipContainerStyle.zIndex)).to.equal(
            zIndexTestCase.expected,
          );
        });
    });
  });
});
