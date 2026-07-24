import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  visitDataAppRoute as visitAppRoute,
} from "e2e/support/helpers";

import {
  DATA_APP_TEST_ENV as TEST_ENV,
  dataAppNumericField as numericField,
} from "./helpers";

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
    const setupQueryStatesApp = () =>
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: {
          ...TEST_ENV,
          // A table id that doesn't exist → the query resolves to an error.
          errorQuery: { source: { type: "table", id: 999999 } },
        },
      });

    it("surfaces the useMetabaseQuery error state", () => {
      setupQueryStatesApp();

      visitAppRoute("query-states");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("query-error", { timeout: 30000 }).should(
          "have.text",
          "error",
        );
      });
    });

    it("re-runs the query when the app calls refetch", () => {
      cy.intercept("POST", "/api/dataset").as("datasetQuery");
      setupQueryStatesApp();

      visitAppRoute("query-states");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        // The query has to have resolved before refetching means anything.
        cy.findByTestId("query-value", { timeout: 30000 })
          .invoke("text")
          .should("match", /^\d+$/);
      });

      // A refetch of a query that already succeeded renders the same value, so the
      // request going out again is the only thing that proves refetch did anything.
      cy.get("@datasetQuery.all").then((queriesBefore) => {
        H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId("query-refetch").click();
        });

        cy.get("@datasetQuery.all").should(
          "have.length",
          queriesBefore.length + 1,
        );
      });
    });

    it("renders a StaticQuestion from useMetabaseQueryObject", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("static-question");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        // A rendered value, not just the header: the hook's query object has to
        // have actually run.
        cy.findAllByTestId("header-cell", { timeout: 30000 }).then(
          ($headers) => {
            const subtotalIndex = [...$headers].findIndex(
              (header) => header.textContent?.trim() === "Subtotal",
            );
            expect(subtotalIndex, "Subtotal column").to.be.at.least(0);

            // Cells are row-major, so the first row's Subtotal sits at the
            // column's own index.
            cy.findByTestId("table-body")
              .findAllByTestId("cell-data")
              .should("have.length.greaterThan", subtotalIndex)
              .then(($cells) => {
                const subtotal = $cells.eq(subtotalIndex).text();
                expect(parseFloat(subtotal.replace(/[^\d.]/g, ""))).to.be.above(
                  0,
                );
              });
          },
        );
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
