const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  createNativeQuestion,
  createQuestion,
  getTableId,
  visitQuestion,
} from "e2e/support/helpers";

import {
  advanceServerClockBy,
  interceptPerformanceRoutes,
  resetServerTime,
} from "./helpers/e2e-performance-helpers";
import {
  durationRadioButton,
  enablePreemptiveCaching,
  openSidebarCacheStrategyForm,
  saveCacheStrategyForm,
} from "./helpers/e2e-strategy-form-helpers";

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

const WRITABLE_TEST_TABLE = "scoreboard_actions";

describe(
  "Preemptive caching for MBQL and native queries",
  { tags: "@external" },
  () => {
    describe("ee", () => {
      beforeEach(() => {
        resetServerTime();
        interceptPerformanceRoutes();
        H.restore("postgres-writable");
        cy.signInAsAdmin();
        H.setTokenFeatures("all");

        H.resetTestTable({ type: "postgres", table: WRITABLE_TEST_TABLE });
        H.resyncDatabase({
          dbId: WRITABLE_DB_ID,
          tableName: WRITABLE_TEST_TABLE,
        });
      });

      function runPreemptiveCachingTest(questionId: string) {
        function visitCachedQuestion(questionId: string) {
          cy.log("Visiting the question");
          visitQuestion(questionId);
        }

        visitCachedQuestion(questionId);
        cy.findByTestId("visualization-root").findByText("Amorous Aardvarks");
        openSidebarCacheStrategyForm("question");
        cy.findByLabelText(/Use default/).click();
        durationRadioButton().click();
        enablePreemptiveCaching();
        saveCacheStrategyForm({
          strategyType: "duration",
          model: "question",
        });

        // Refreshing the question causes us to cache it
        visitCachedQuestion(questionId);
        cy.findByTestId("visualization-root").findByText("Amorous Aardvarks");

        // Value changes in the DB
        H.queryWritableDB(
          `UPDATE ${WRITABLE_TEST_TABLE} SET team_name = 'New Value' where id = 1;`,
        );

        // Check that old value is still cached
        visitCachedQuestion(questionId);
        cy.findByTestId("visualization-root").findByText("Amorous Aardvarks");

        // Advance server clock more, and then trigger automatic cache refresh
        advanceServerClockBy(CACHE_DURATION_MS + 5000);
        cy.log("Triggering cache refresh task");
        cy.request("POST", "/api/testing/refresh-caches");

        // Wait to ensure we're fetching the refreshed cache
        cy.wait(500);

        visitCachedQuestion(questionId);
        cy.findByTestId("visualization-root").findByText("New Value");
      }

      it("Returns matching results when an MBQL query is cached preemptively", () => {
        getTableId({
          databaseId: WRITABLE_DB_ID,
          name: WRITABLE_TEST_TABLE,
        }).then(tableId => {
          createQuestion(
            {
              name: "Cached question",
              database: WRITABLE_DB_ID,
              query: {
                "source-table": tableId,
              },
              type: "question",
            },
            {
              wrapId: true,
              idAlias: "mbqlQuestionId",
            },
          );
        });

        runPreemptiveCachingTest("@mbqlQuestionId");
      });

      it("Returns matching results when a native query is cached preemptively", () => {
        createNativeQuestion(
          {
            name: "Cached question",
            database: WRITABLE_DB_ID,
            native: {
              query: `SELECT * FROM ${WRITABLE_TEST_TABLE};`,
            },
          },
          {
            wrapId: true,
            idAlias: "nativeQuestionId",
          },
        );

        runPreemptiveCachingTest("@nativeQuestionId");
      });
    });
  },
);
