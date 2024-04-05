import { onlyOn } from "@cypress/skip-test";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  openReviewsTable,
  visualize,
  openNotebook,
  startNewQuestion,
  popover,
  visitQuestionAdhoc,
  saveQuestion,
  visitQuestion,
  createQuestion,
  saveSavedQuestion,
  withDatabase,
  describeWithSnowplow,
  resetSnowplow,
  enableTracking,
  expectGoodSnowplowEvent,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > notebook > native query preview sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show empty sidebar when no data source is selcted", () => {
    cy.intercept("POST", "/api/dataset/native").as("nativeDataset");
    openReviewsTable({ mode: "notebook", limit: 1 });
    cy.findByLabelText("View the SQL").click();
    cy.wait("@nativeDataset");

    cy.findByTestId("app-bar").findByLabelText("New").click();
    popover().findByTextEnsureVisible("Question").click();
    cy.wait("@nativeDataset");
    cy.findByTestId("data-step-cell").should(
      "have.text",
      "Pick your starting data",
    );

    cy.findByTestId("native-query-preview-sidebar").within(() => {
      cy.findByText("SQL for this question").should("exist");
      cy.get(".ace_content").should("not.exist");
      cy.button("Convert this question to SQL").should("not.exist");
    });
  });

  it(
    "smoke test: should show the preview sidebar, update it, persist it and close it",
    // Replay Chromium does not respect a media query for the sidebar, which crashes this test.
    // We have to use a different browser until that upstream bug is fixed.
    { browser: "firefox" },
    () => {
      const defaultRowLimit = 1048575;
      const queryLimit = 2;

      cy.intercept("POST", "/api/dataset/native").as("nativeDataset");

      openReviewsTable({ mode: "notebook", limit: queryLimit });
      cy.findByLabelText("View the SQL").click();
      cy.wait("@nativeDataset");
      cy.findByTestId("native-query-preview-sidebar").within(() => {
        cy.findByText("SQL for this question").should("exist");
        cy.get(".ace_content")
          .should("contain", "SELECT")
          .and("contain", queryLimit);
        cy.button("Convert this question to SQL").should("exist");
      });

      cy.log(
        "Sidebar state should be persisted when navigating away from the notebook",
      );
      visualize();
      cy.findAllByTestId("header-cell").should("contain", "Rating");
      cy.findByTestId("native-query-preview-sidebar")
        .should("exist")
        .and("not.be.visible");

      openNotebook();
      cy.findByTestId("native-query-preview-sidebar").should("be.visible");

      cy.log("Modifying GUI query should update the SQL preview");
      cy.findByTestId("step-limit-0-0").icon("close").click({ force: true });
      cy.wait("@nativeDataset");
      cy.findByTestId("native-query-preview-sidebar")
        .get(".ace_content")
        .should("contain", "SELECT")
        .and("contain", defaultRowLimit)
        .and("not.contain", queryLimit);

      cy.log("It should be possible to close the sidebar");
      cy.findByLabelText("Hide the SQL").click();
      cy.findByTestId("native-query-preview-sidebar").should("not.exist");
    },
  );

  it("should not offer the sidebar preview for a user without native permissions", () => {
    cy.signIn("nosql");
    openReviewsTable({ mode: "notebook" });
    cy.findByTestId("qb-header-action-panel")
      .find(".Icon")
      .should("have.length", 1);
    cy.findByLabelText("View the SQL").should("not.exist");
    cy.findByTestId("native-query-preview-sidebar").should("not.exist");
    cy.get("code").should("not.exist");
  });

  it(
    "should work on small screens",
    { viewportWidth: 480, viewportHeight: 800 },
    () => {
      openReviewsTable({ mode: "notebook", limit: 1 });
      cy.location("pathname").should("eq", "/question/notebook");

      cy.log("Opening a preview sidebar should completely cover the notebook");
      cy.findByLabelText("View the SQL").click();
      cy.location("pathname").should("eq", "/question/notebook");
      cy.log(
        "It shouldn't be possible to click on any of the notebook elements",
      );
      cy.button("Visualize").click({ timeout: 500 }); // no need to wait four seconds

      /**
       * The only reliable way to test that the button is not clickable because it is covered by another element.
       * Sources:
       *  - https://stackoverflow.com/a/52142935/8815185
       *  - https://github.com/cypress-io/cypress/discussions/21150#discussioncomment-2620947
       */
      cy.once("fail", err => {
        expect(err.message).to.include(
          "`cy.click()` failed because this element",
        );
        expect(err.message).to.include("is being covered by another element");
        // returning false here prevents Cypress from failing the test
        return false;
      });
    },
  );
});

describe("converting question to SQL (metabase#12651, metabase#21615, metabase#32121, metabase#40422)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to convert an ad-hoc time-series table query to SQL (metabase#21615)", () => {
    visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
    });

    cy.findByTestId("timeseries-chrome").should("be.visible");
    cy.findByLabelText("Row count").should("have.text", "Showing 49 rows");

    convertToSql();
    cy.log("`/notebook` should be removed from the URL (metabase#12651)");
    cy.location("pathname").should("eq", "/question");

    cy.findByTestId("timeseries-chrome").should("not.exist");
    cy.findByLabelText("Row count").should("have.text", "Showing 49 rows");
  });

  it("should be possible to save a question based on a table after converting to SQL (metabase#40422)", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    convertToSql();
    saveSavedQuestion();
    cy.get(".cellData").should("contain", "37.65");

    cy.log(
      "should be possible to `Explore results` after saving a question (metabase#32121)",
    );
    cy.findByTestId("qb-header").findByText("Explore results").click();
    cy.get(".cellData").should("contain", "37.65");
  });

  it("should be possible to save a question based on another question after converting to SQL (metabase#40422)", () => {
    createQuestion(
      { query: { "source-table": `card__${ORDERS_QUESTION_ID}` } },
      { visitQuestion: true },
    );
    convertToSql();
    saveSavedQuestion();
    cy.get(".cellData").should("contain", "37.65");
  });
});

describe(
  "converting question to a native query (metabase#15946, metabase#32121, metabase#38181)",
  { tags: "@mongo" },
  () => {
    const MONGO_DB_NAME = "QA Mongo";
    const MONGO_DB_ID = 2;

    beforeEach(() => {
      restore("mongo-5");
      cy.signInAsAdmin();
    });

    it("should work for both simple and nested questions based on previously converted GUI query", () => {
      startNewQuestion();
      popover().within(() => {
        cy.findByText("Raw Data").click();
        cy.findByText(MONGO_DB_NAME).click();
        cy.findByText("Products").click();
      });

      cy.log("Simple question");
      cy.findByLabelText("View the native query").click();
      cy.findByTestId("native-query-preview-sidebar").within(() => {
        cy.findByText("Native query for this question").should("exist");
        cy.get(".ace_content")
          .should("contain", "$project")
          .and("contain", "$limit");

        cy.button("Convert this question to a native query").click();
      });

      cy.log("Database and table should be pre-selected (metabase#15946)");
      cy.findByTestId("selected-database").should("have.text", MONGO_DB_NAME);
      cy.findByTestId("selected-table").should("have.text", "Products");
      cy.get(".cellData").should("contain", "Small Marble Shoes");

      cy.log("Nested question");
      cy.log(
        "should be possible to save a question and `Explore results` (metabase#32121)",
      );
      saveQuestion("foo");
      cy.findByTestId("qb-header").findByText("Explore results").click();
      cy.get(".cellData").should("contain", "Small Marble Shoes");

      // FIXME: Remove `onlyOn` wrapper block once the issue #38181 is fixed!
      onlyOn(false, () => {
        cy.log("The generated query should be valid (metabase#38181)");
        openNotebook(); // SQL sidebar state was persisted so it's already open now
        cy.findByTestId("native-query-preview-sidebar").within(() => {
          cy.findByText("Native query for this question").should("exist");
          cy.get(".ace_content")
            .should("contain", "$project")
            .and("contain", "$limit")
            .and("not.contain", "BsonString")
            .and("not.contain", "BsonInt32");

          cy.button("Convert this question to a native query").click();
        });

        cy.log(
          "Database and table should be pre-selected (metabase#15946 and/or metabase#40557)",
        );
        cy.findByTestId("selected-database").should("have.text", MONGO_DB_NAME);
        cy.findByTestId("selected-table").should("have.text", "Products");
        cy.get(".cellData").should("contain", "Small Marble Shoes");
      });
    });

    it.skip("should work for a nested GUI question (metabase#40557)", () => {
      withDatabase(MONGO_DB_ID, ({ PRODUCTS_ID }: { PRODUCTS_ID: number }) => {
        createQuestion({
          name: "Mongo Source",
          query: {
            "source-table": PRODUCTS_ID,
            limit: 1,
          },
          database: MONGO_DB_ID,
        }).then(({ body: { id: sourceId } }) => {
          createQuestion(
            {
              name: "Mongo Nested",
              query: {
                "source-table": `card__${sourceId}`,
              },
              database: MONGO_DB_ID,
            },
            { visitQuestion: true },
          );
        });
      });

      cy.get(".cellData").should("contain", "Small Marble Shoes");
      openNotebook();
      cy.findByLabelText("View the native query").click();

      cy.findByTestId("native-query-preview-sidebar").within(() => {
        cy.findByText("Native query for this question").should("exist");
        cy.get(".ace_content")
          .should("contain", "$project")
          .and("contain", "$limit")
          .and("not.contain", "BsonString")
          .and("not.contain", "BsonInt32");

        cy.button("Convert this question to a native query").click();
      });

      cy.log("Database and table should be pre-selected (metabase#40557)");
      cy.findByTestId("selected-database").should("have.text", MONGO_DB_NAME);
      cy.findByTestId("selected-table").should("have.text", "Products");
      cy.get(".cellData").should("contain", "Small Marble Shoes");
    });
  },
);

describeWithSnowplow(
  "scenarios > notebook > native query preview sidebar tracking events",
  () => {
    beforeEach(() => {
      resetSnowplow();
      restore();
      cy.signInAsAdmin();
      enableTracking();
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    it("should track `notebook_native_preview_shown|hidden` events", () => {
      cy.intercept("POST", "/api/dataset/native").as("nativeDataset");
      openReviewsTable({ mode: "notebook", limit: 1 });
      expectGoodSnowplowEvents(1); // page view

      cy.findByLabelText("View the SQL").click();
      cy.wait("@nativeDataset");
      cy.findByTestId("native-query-preview-sidebar").should("exist");

      expectGoodSnowplowEvent({
        event: "notebook_native_preview_shown",
      });

      cy.findByLabelText("Hide the SQL").click();
      cy.findByTestId("native-query-preview-sidebar").should("not.exist");

      expectGoodSnowplowEvent({
        event: "notebook_native_preview_hidden",
      });

      expectGoodSnowplowEvents(3);
    });
  },
);

function convertToSql() {
  openNotebook();
  cy.findByLabelText("View the SQL").click();
  cy.intercept("POST", "/api/dataset").as("dataset");
  cy.button("Convert this question to SQL").click();
  cy.wait("@dataset");
  cy.findByTestId("native-query-editor").should("be.visible");
}
