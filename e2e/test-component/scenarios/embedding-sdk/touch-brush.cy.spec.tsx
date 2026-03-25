import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  disableTouchEmulation,
  enableTouchEmulation,
  longPressAndDrag,
  quickSwipe,
} from "e2e/support/helpers/e2e-mobile-device-helpers";
import { echartsContainer } from "e2e/support/helpers/e2e-visual-tests-helpers";
import { mountInteractiveQuestion } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

function waitForChart() {
  getSdkRoot().within(() => {
    echartsContainer().should("be.visible");
  });
  cy.wait(200);
}

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
      mountInteractiveQuestion();
      waitForChart();

      longPressAndDrag("chart-container", 100, 150, 250);

      getSdkRoot().within(() => {
        cy.findByText("Count by Product ID").should("be.visible");
      });
    });

    it("should NOT trigger brush on quick horizontal swipe", () => {
      mountInteractiveQuestion();
      waitForChart();

      quickSwipe("chart-container", 100, 150, 250);

      cy.wait(1000);
      getSdkRoot().within(() => {
        cy.findByText("Count by Product ID").should("not.exist");
      });
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
        .trigger("mousemove", 300, 150)
        .trigger("mouseup", 300, 150);

      getSdkRoot().within(() => {
        cy.findByText("Count by Product ID").should("be.visible");
      });
    });
  });
});
