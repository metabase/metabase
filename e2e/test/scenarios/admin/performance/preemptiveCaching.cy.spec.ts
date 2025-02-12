const { H } = cy;

import { TEST_TABLE, sampleQuestion } from "./helpers/constants";
import {
  advanceServerClockBy,
  interceptPerformanceRoutes,
  resetServerTime,
  setupQuestionTest,
} from "./helpers/e2e-performance-helpers";
import {
  durationRadioButton,
  enablePreemptiveCaching,
  openSidebarCacheStrategyForm,
  saveCacheStrategyForm,
} from "./helpers/e2e-strategy-form-helpers";

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

describe(
  "Preemptive caching for dashboards and questions",
  { tags: "@external" },
  () => {
    describe("ee", () => {
      beforeEach(() => {
        resetServerTime();
        interceptPerformanceRoutes();
        H.restore("postgres-writable");
        H.resetTestTable({ type: "postgres", table: TEST_TABLE });
        cy.signInAsAdmin();
        H.setTokenFeatures("all");
      });

      it("Returns matching results when cached preemptively", () => {
        // Enable preemptive caching on a question
        const { visitItem } = setupQuestionTest(sampleQuestion);
        visitItem();
        cy.findByTestId("visualization-root").findByText("Old Value");
        openSidebarCacheStrategyForm("question");
        cy.findByLabelText(/Use default/).click();
        durationRadioButton().click();
        enablePreemptiveCaching();
        saveCacheStrategyForm({ strategyType: "duration", model: "question" });

        // Refreshing the question causes us to cache it
        visitItem();
        cy.findByTestId("visualization-root").findByText("Old Value");

        // Value changes in the DB
        H.queryWritableDB(`UPDATE ${TEST_TABLE} SET my_text='New Value';`);

        // Check that old value is still cached
        advanceServerClockBy(CACHE_DURATION_MS - 1000);
        visitItem();
        cy.findByTestId("visualization-root").findByText("Old Value");

        // Advance server clock more, and then trigger automatic cache refresh
        advanceServerClockBy(2000);
        cy.log("Triggering cache refresh task");
        cy.request("POST", "/api/testing/refresh-caches");

        cy.wait(1000);

        visitItem();
        cy.findByTestId("visualization-root").findByText("New Value");
      });
    });
  },
);
