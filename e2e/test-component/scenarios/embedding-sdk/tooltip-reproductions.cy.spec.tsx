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
              size_y: 20,
              row: 0,
              col: 0,
              card_id: ordersQuestionId,
            },
            {
              id: 2,
              size_x: 10,
              size_y: 5,
              row: 1,
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

  it("should render tooltips below the screen's height", () => {
    cy.get("@dashboardId").then(dashboardId => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    H.getDashboardCard(0).within(() => {
      H.chartPathWithFillColor("#509EE3").eq(0).realHover().wait(200);
    });

    cy.findAllByTestId("echarts-tooltip")
      .eq(0)
      .should("exist")
      .then($tooltip => {
        const tooltipElement = $tooltip[0];

        // The tooltip is indeed visible if we clicked on a child of the tooltip.
        // Using `.should("be.visible")` does not work here as Cypress incorrectly
        // reports the tooltip is obscured by the bar chart even though it has a higher z-index.
        const isTopmostElementChildOfTooltip = checkIfElementIsChildOf(
          getVisibleTopmostElement(tooltipElement),
          element => element === tooltipElement,
        );

        expect(isTopmostElementChildOfTooltip).to.equal(true);
      });
  });
});

/**
 * Get the topmost element that is visible and not obscured by other elements.
 **/
function getVisibleTopmostElement(targetElement: HTMLElement) {
  const targetElementRect = targetElement.getBoundingClientRect();
  const originalPointerEvents = targetElement.style.pointerEvents;

  // Temporarily enable pointer events for tooltip so elementsFromPoint can see it.
  targetElement.style.pointerEvents = "auto";

  // Get all elements at the tooltip's center point
  const elementsAtPoint = document.elementsFromPoint(
    targetElementRect.left + targetElementRect.width / 2,
    targetElementRect.top + targetElementRect.height / 2,
  );

  // Restore original pointer-events
  targetElement.style.pointerEvents = originalPointerEvents;

  // Find the topmost element we clicked on.
  return elementsAtPoint[0];
}

function checkIfElementIsChildOf(
  element: Element,
  parentPredicate: (element: Element) => boolean,
): boolean {
  let currentElement = element;

  while (currentElement && currentElement !== document.body) {
    if (parentPredicate(currentElement)) {
      return true;
    }

    if (currentElement.parentElement) {
      currentElement = currentElement.parentElement;
    }
  }

  return false;
}
