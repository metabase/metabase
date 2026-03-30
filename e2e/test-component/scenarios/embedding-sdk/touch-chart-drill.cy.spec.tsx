import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { cartesianChartCircle, popover } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  disableTouchEmulation,
  enableTouchEmulation,
} from "e2e/support/helpers/e2e-mobile-device-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > touch chart drill popover", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createDashboardWithQuestions({
      dashboardName: "Touch drill test dashboard",
      questions: [
        {
          name: "Line chart for touch drill",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
            limit: 5,
          },
        },
      ],
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

  describe("touch device", () => {
    beforeEach(() => {
      cy.viewport("iphone-x");
      enableTouchEmulation();
    });

    afterEach(() => {
      disableTouchEmulation();
    });

    it("should show drill popover near the tapped data point, not offscreen", () => {
      cy.get<string>("@dashboardId").then((dashboardId) => {
        mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
      });

      cy.wait("@dashcardQuery");

      // Use realTouch() from cypress-real-events to dispatch native touch
      // events via CDP (Input.dispatchTouchEvent). This goes through the full
      // browser pipeline — zrender receives real touchstart/touchend, simulates
      // a click with the original TouchEvent, and our fix in getEventTarget()
      // extracts clientX/clientY from changedTouches.
      // Cypress .click() sends a MouseEvent which always has clientX/clientY
      // and wouldn't exercise the TouchEvent code path.
      let circleRect: DOMRect;

      getSdkRoot().within(() => {
        H.getDashboardCard(0).within(() => {
          cartesianChartCircle()
            .first()
            .then(($circle) => {
              circleRect = $circle[0].getBoundingClientRect();
            })
            .realTouch();
        });

        popover()
          .should("be.visible")
          .then(($popover) => {
            const popoverRect = $popover[0].getBoundingClientRect();

            // The popover should be positioned near the tapped data point,
            // not at some arbitrary position far away. We allow a generous
            // threshold because floating-ui may flip/shift the popover to
            // keep it in the viewport, but it should remain in the vicinity
            // of the data point (within 300px).
            // Before the touch fix, the popover anchor received NaN
            // coordinates on touch devices, placing it far offscreen.
            const MAX_DISTANCE = 300;
            const popoverCenterX = popoverRect.left + popoverRect.width / 2;
            const popoverCenterY = popoverRect.top + popoverRect.height / 2;
            const circleCenterX = circleRect.left + circleRect.width / 2;
            const circleCenterY = circleRect.top + circleRect.height / 2;

            const distance = Math.sqrt(
              (popoverCenterX - circleCenterX) ** 2 +
                (popoverCenterY - circleCenterY) ** 2,
            );
            expect(
              distance,
              "popover should be near the tapped data point",
            ).to.be.lessThan(MAX_DISTANCE);
          });
      });
    });
  });
});
