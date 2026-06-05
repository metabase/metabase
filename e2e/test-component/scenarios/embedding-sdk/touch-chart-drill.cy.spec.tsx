import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { popover } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  disableTouchEmulation,
  enableTouchEmulation,
} from "e2e/support/helpers/e2e-mobile-device-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

function touchTapOnDataPoint(
  $container: JQuery<HTMLElement>,
  win: Cypress.AUTWindow,
) {
  const circle = $container[0].querySelector(`path[d="${CIRCLE_PATH}"]`);
  expect(circle, "chart should have a data point circle").to.not.be.null;

  const circleRect = circle!.getBoundingClientRect();
  const clientX = circleRect.left + circleRect.width / 2;
  const clientY = circleRect.top + circleRect.height / 2;

  const touch = new win.Touch({
    identifier: 0,
    target: circle!,
    clientX,
    clientY,
  });

  // touchstart — zrender reads targetTouches[0] for this event type
  circle!.dispatchEvent(
    new win.TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch],
    }),
  );

  circle!.dispatchEvent(
    new win.TouchEvent("touchend", {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: [touch],
    }),
  );

  return { clientX, clientY };
}

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

      cy.window().then((win) => {
        if (!("ontouchstart" in win)) {
          (win as any).ontouchstart = null;
        }
      });
    });

    afterEach(() => {
      disableTouchEmulation();
    });

    it("should show drill popover near the tapped data point, not offscreen", () => {
      cy.get<string>("@dashboardId").then((dashboardId) => {
        mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
      });

      cy.wait("@dashcardQuery");

      let tapCoords: { clientX: number; clientY: number };

      getSdkRoot().within(() => {
        H.getDashboardCard(0).within(() => {
          cy.findByTestId("chart-container").then(($container) => {
            // Wait for circles to render
            cy.wrap($container)
              .find(`path[d="${CIRCLE_PATH}"]`)
              .should("exist");

            cy.window().then((win) => {
              tapCoords = touchTapOnDataPoint($container, win);
            });
          });
        });

        popover()
          .should("be.visible")
          .then(($popover) => {
            const popoverRect = $popover[0].getBoundingClientRect();

            const MAX_DISTANCE = 300;
            const popoverCenterX = popoverRect.left + popoverRect.width / 2;
            const popoverCenterY = popoverRect.top + popoverRect.height / 2;

            const distance = Math.sqrt(
              (popoverCenterX - tapCoords.clientX) ** 2 +
                (popoverCenterY - tapCoords.clientY) ** 2,
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
