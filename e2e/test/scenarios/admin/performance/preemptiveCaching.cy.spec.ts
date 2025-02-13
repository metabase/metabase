const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { createQuestion, getTableId, visitQuestion } from "e2e/support/helpers";

import { TEST_TABLE, sampleNativeQuestion } from "./helpers/constants";
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

      it("Returns matching results when an MBQL query is cached preemptively", () => {
        // Using WRITABLE_TEST_TABLE because creating a question using TEST_TABLE doesn't work...
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
              idAlias: "questionId",
            },
          );
          const visitItem = () =>
            cy.then(function () {
              cy.log("Visiting the question");
              visitQuestion("@questionId");
            });

          visitItem();

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
          visitItem();
          cy.findByTestId("visualization-root").findByText("Amorous Aardvarks");

          // Value changes in the DB
          H.queryWritableDB(
            `UPDATE ${WRITABLE_TEST_TABLE} SET team_name = 'New Value' where id = 1;`,
          );

          // Check that old value is still cached
          advanceServerClockBy(CACHE_DURATION_MS - 1000);
          visitItem();
          cy.findByTestId("visualization-root").findByText("Amorous Aardvarks");

          // Advance server clock more, and then trigger automatic cache refresh
          advanceServerClockBy(2000);
          cy.log("Triggering cache refresh task");
          cy.request("POST", "/api/testing/refresh-caches");

          visitItem();
          cy.findByTestId("visualization-root").findByText("New Value");
        });
      });

      it("Returns matching results when a native query is cached preemptively", () => {
        const { visitItem } = setupQuestionTest(sampleNativeQuestion);
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

        visitItem();
        cy.findByTestId("visualization-root").findByText("New Value");
      });
    });
  },
);
