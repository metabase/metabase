import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { echartsContainer } from "e2e/support/helpers/e2e-visual-tests-helpers";
import { mountInteractiveQuestion } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const LONG_PRESS_MS = 600;

// ---------------------------------------------------------------------------
// CDP touch helpers — dispatches real (trusted) touch events via the browser
// ---------------------------------------------------------------------------

function cdpTouch(
  type: "touchStart" | "touchMove" | "touchEnd",
  x?: number,
  y?: number,
) {
  const touchPoints =
    type === "touchEnd"
      ? []
      : [{ x: x!, y: y!, id: 0, radiusX: 1, radiusY: 1, force: 1 }];

  return Cypress.automation("remote:debugger:protocol", {
    command: "Input.dispatchTouchEvent",
    params: { type, touchPoints },
  });
}

/**
 * Real CDP touch long-press + horizontal drag.
 * Coordinates are absolute viewport pixels (use getBoundingClientRect).
 */
function longPressAndDrag(
  startX: number,
  startY: number,
  endX: number,
  holdMs = LONG_PRESS_MS,
) {
  // Finger down
  cy.then(() => cdpTouch("touchStart", startX, startY));

  // Hold still
  cy.wait(holdMs);

  // Drag in steps for realistic gesture
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(startX + ((endX - startX) * i) / steps);
    cy.then(() => cdpTouch("touchMove", x, startY));
    cy.wait(16);
  }

  // Lift finger
  cy.then(() => cdpTouch("touchEnd"));
}

/**
 * Real CDP touch quick swipe (no hold).
 */
function quickSwipe(startX: number, startY: number, endX: number) {
  cy.then(() => cdpTouch("touchStart", startX, startY));

  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(startX + ((endX - startX) * i) / steps);
    cy.then(() => cdpTouch("touchMove", x, startY));
    cy.wait(16);
  }

  cy.then(() => cdpTouch("touchEnd"));
}

function enableTouchEmulation() {
  Cypress.automation("remote:debugger:protocol", {
    command: "Emulation.setTouchEmulationEnabled",
    params: { enabled: true, maxTouchPoints: 5 },
  });
}

function disableTouchEmulation() {
  Cypress.automation("remote:debugger:protocol", {
    command: "Emulation.setTouchEmulationEnabled",
    params: { enabled: false, maxTouchPoints: 0 },
  });
}

function waitForChart() {
  getSdkRoot().within(() => {
    echartsContainer().should("be.visible");
  });
  cy.wait(200);
}

/**
 * Get center coordinates of the chart container in viewport pixels.
 */
function getChartCenter(): Cypress.Chainable<{ x: number; y: number }> {
  return cy.findByTestId("chart-container").then(($el) => {
    const rect = $el[0].getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scenarios > embedding-sdk > touch-brush", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "Line chart for brush test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
      },
      display: "line",
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  describe("touch device", () => {
    beforeEach(() => {
      cy.viewport("iphone-x");
      enableTouchEmulation();
    });

    afterEach(() => {
      disableTouchEmulation();
    });

    it("should activate brush on long press + horizontal drag", () => {
      cy.intercept("POST", "/api/card/*/query").as("brushQuery");

      mountInteractiveQuestion();
      // Initial query
      cy.wait("@brushQuery");
      waitForChart();

      getChartCenter().then(({ x, y }) => {
        longPressAndDrag(x - 50, y, x + 50);
      });

      // Brush should trigger a second query with filter
      cy.wait("@brushQuery").its("request.body.parameters").should("exist");
    });

    it("should NOT trigger brush on quick horizontal swipe", () => {
      cy.intercept("POST", "/api/card/*/query").as("brushQuery");

      mountInteractiveQuestion();
      cy.wait("@brushQuery");
      waitForChart();

      getChartCenter().then(({ x, y }) => {
        quickSwipe(x - 50, y, x + 50);
      });

      // No second query — brush did not activate
      cy.wait(1000);
      cy.get("@brushQuery.all").should("have.length", 1);
    });

    it("should suppress context menu on the chart", () => {
      mountInteractiveQuestion();
      waitForChart();

      cy.findByTestId("chart-container").then(($el) => {
        const event = new Event("contextmenu", {
          bubbles: true,
          cancelable: true,
        });
        const prevented = !$el[0].dispatchEvent(event);

        expect(prevented).to.be.true;
      });
    });
  });

  describe("desktop (non-touch)", () => {
    it("should trigger brush on regular mouse drag", () => {
      mountInteractiveQuestion();
      waitForChart();

      cy.findByTestId("query-visualization-root")
        .trigger("mousedown", 150, 150)
        .trigger("mousemove", 150, 150)
        .trigger("mouseup", 300, 150);

      cy.findByTestId("filter-pill").should("exist");
    });
  });
});
