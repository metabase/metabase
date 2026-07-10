import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  DATA_APP_TEST_ENV as TEST_ENV,
  dataAppNumericField as numericField,
  visitDataAppRoute as visitAppRoute,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > data apps > SDK runtime", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  describe("query hooks & question components", () => {
    it("surfaces the useMetabaseQuery error state and lets the app refetch", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: {
          ...TEST_ENV,
          // A table id that doesn't exist → the query resolves to an error.
          errorQuery: { source: { type: "table", id: 999999 } },
        },
      });

      visitAppRoute("query-states");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("query-error", { timeout: 30000 }).should(
          "have.text",
          "error",
        );
        // refetch is exposed and callable (stays in the error state here).
        cy.findByTestId("query-refetch").click();
        cy.findByTestId("query-error").should("have.text", "error");
      });
    });

    it("renders a StaticQuestion from useMetabaseQueryObject", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("static-question");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByText("Subtotal", { timeout: 30000 }).should("be.visible");
      });
    });

    it("builds a query with filter/breakout/orderBy/aggregations helpers", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: {
          ...TEST_ENV,
          combinators: {
            source: { type: "table", id: ORDERS_ID },
            filterField: numericField(ORDERS.TOTAL, "TOTAL"),
            filterValue: 50,
            breakoutField: numericField(ORDERS.PRODUCT_ID, "PRODUCT_ID"),
          },
        },
      });

      visitAppRoute("combinators");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("combinators-loading", { timeout: 30000 }).should(
          "have.text",
          "done",
        );
        cy.findByTestId("combinators-error").should("have.text", "no-error");
        // `.should(callback)` retries until the query resolves with rows.
        cy.findByTestId("combinators-rowcount", { timeout: 30000 }).should(
          ($el) => {
            expect(Number($el.text())).to.be.greaterThan(0);
          },
        );
      });
    });
  });

  describe("actions (useAction)", () => {
    const setupActionsApp = (actionId: number | undefined) =>
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: { ...TEST_ENV, actionId },
      });

    it("executes an action and exposes isExecuting + result, then resets", () => {
      cy.intercept("POST", "/api/action/*/execute", (req) =>
        req.reply({
          statusCode: 200,
          body: { "rows-affected": 1 },
          delay: 300,
        }),
      ).as("execute");
      setupActionsApp(99);

      visitAppRoute("actions");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("action-execute").click();
        cy.findByTestId("action-executing").should("have.text", "executing");
        cy.findByTestId("action-result", { timeout: 30000 }).should(
          "have.text",
          "has-result",
        );
        cy.findByTestId("action-output").should("have.text", "returned-result");

        // reset() clears result and error.
        cy.findByTestId("action-reset").click();
        cy.findByTestId("action-result").should("have.text", "no-result");
        cy.findByTestId("action-error").should("have.text", "no-error");
      });
    });

    it("surfaces a validation error from a failed execute", () => {
      cy.intercept("POST", "/api/action/*/execute", {
        statusCode: 400,
        body: { message: "Invalid", errors: { name: "required" } },
      });
      setupActionsApp(99);

      visitAppRoute("actions");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("action-execute").click();
        cy.findByTestId("action-error", { timeout: 30000 }).should(
          "have.text",
          "has-error",
        );
        cy.findByTestId("action-result").should("have.text", "no-result");
      });
    });
  });

  describe("clipboard (copy)", () => {
    it("writes text to the clipboard from a user click", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("clipboard");

      // Headless Chrome reports the iframe document as unfocused, so the real
      // `navigator.clipboard.writeText` rejects ("Document is not focused").
      // Stub it: the test still verifies the app reaches the sanctioned `copy`
      // (not blocked by the sandbox) with the right text — the OS write itself
      // is browser behavior, not ours.
      H.dataAppIframe(APP_DISPLAY_NAME).then(($body) => {
        const win = $body[0].ownerDocument.defaultView;
        if (win) {
          const writeText = cy.stub(win.navigator.clipboard, "writeText");
          writeText.resolves();
          writeText.as("writeText");
        }
      });

      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("clipboard-copy").click();
        cy.findByTestId("clipboard-status", { timeout: 30000 }).should(
          "have.text",
          "copied",
        );
      });

      cy.get("@writeText").should(
        "have.been.calledOnceWith",
        "data-app-clipboard-payload",
      );
    });
  });

  describe("error component", () => {
    it("shows the default neutral error state for a missing question", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("missing-question");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByText(/not found/i, { timeout: 30000 }).should("be.visible");
      });
    });

    it("lets an app override the default with its own errorComponent", () => {
      const CUSTOM_APP = "custom-error-component";
      const CUSTOM_DISPLAY = "Custom Error App";

      H.mockDataApp(CUSTOM_APP, { displayName: CUSTOM_DISPLAY });

      H.openDataApp(CUSTOM_APP);
      H.dataAppIframe(CUSTOM_DISPLAY).within(() => {
        cy.findByTestId("custom-error-component", { timeout: 30000 })
          .should("be.visible")
          .and("contain", "Custom app error");
      });
    });
  });
});
