// TypeScript doesn't recognize `onlyOn` on the `cy` object.
// Hence, we have to import it as a standalone helper.
import { onlyOn } from "@cypress/skip-test";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import {
  createQuestion,
  isEE,
  isOSS,
  openNotebook,
  openQuestionActions,
  openReviewsTable,
  popover,
  resetTestTable,
  restore,
  resyncDatabase,
  saveQuestion,
  startNewQuestion,
  visitModel,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";
import { checkNotNull } from "metabase/lib/types";

const { REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > notebook > data source", () => {
  describe("empty app db", () => {
    beforeEach(() => {
      restore("setup");
      cy.signInAsAdmin();
    });

    it(
      "should display tables from the only existing database by default",
      { tags: "@OSS" },
      () => {
        onlyOn(isOSS);
        cy.visit("/");
        cy.findByTestId("app-bar").findByText("New").click();
        popover().findByTextEnsureVisible("Question").click();
        cy.findByTestId("data-step-cell").should(
          "have.text",
          "Pick your starting data",
        );

        popover().within(() => {
          cy.findByTestId("source-database").should(
            "have.text",
            "Sample Database",
          );
          cy.findAllByRole("option")
            .should("have.length", 8)
            .each(table => {
              cy.wrap(table).should("have.attr", "aria-selected", "false");
            });
        });
      },
    );

    it.skip("should display tables from the only existing database by default on an enterprise instance without token activation (metabase#40223)", () => {
      onlyOn(isEE);
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByTextEnsureVisible("Question").click();
      cy.findByTestId("data-step-cell").should(
        "have.text",
        "Pick your starting data",
      );

      popover().within(() => {
        cy.findByTestId("source-database").should(
          "have.text",
          "Sample Database",
        );
        cy.findAllByRole("option")
          .should("have.length", 8)
          .each(table => {
            cy.wrap(table).should("have.attr", "aria-selected", "false");
          });
      });
    });

    it("should not show saved questions if only models exist (metabase#25142)", () => {
      createQuestion({
        name: "GUI Model",
        query: { "source-table": REVIEWS_ID, limit: 1 },
        display: "table",
        type: "model",
      });

      startNewQuestion();
      popover().within(() => {
        cy.findByPlaceholderText("Search for some data…");
        cy.findAllByTestId("data-bucket-list-item")
          .as("sources")
          .should("have.length", 2);
        cy.get("@sources")
          .first()
          .should("contain", "Models")
          .and("have.attr", "aria-selected", "false");
        cy.get("@sources")
          .last()
          .should("contain", "Raw Data")
          .and("have.attr", "aria-selected", "false");
      });
    });

    // There is a huge discrepancy between how we render this popover vs the one for models
    // That's the reason this test is a bit vague. Will be reported as a separate issue
    // and covered in a separate reproduction.
    it("should not show models if only saved questions exist", () => {
      createQuestion({
        name: "GUI Question",
        query: { "source-table": REVIEWS_ID, limit: 1 },
        display: "table",
      });

      startNewQuestion();
      popover().within(() => {
        cy.get(".List-section-title")
          .should("have.length", 2)
          .and("contain", "Saved Questions")
          .and("not.contain", "Models");
      });
    });
  });

  describe("table as a source", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should correctly display the source data for ad-hoc questions", () => {
      openReviewsTable();
      openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Reviews").click();
      popover().within(() => {
        cy.findByTestId("source-database").should(
          "have.text",
          "Sample Database",
        );
        cy.findByLabelText("Reviews").should(
          "have.attr",
          "aria-selected",
          "true",
        );
      });
    });

    it("should correctly display the source data for a simple saved question", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      popover().within(() => {
        cy.findByTestId("source-database").should(
          "have.text",
          "Sample Database",
        );
        cy.findByLabelText("Orders").should(
          "have.attr",
          "aria-selected",
          "true",
        );
      });
    });

    it(
      "should correctly display a table from a multi-schema database (metabase#39807)",
      { tags: "@external" },
      () => {
        const dialect = "postgres";
        const TEST_TABLE = "multi_schema";

        const dbName = "Writable Postgres12";
        const schemaName = "Wild";
        const tableName = "Animals";

        resetTestTable({ type: dialect, table: TEST_TABLE });
        restore(`${dialect}-writable`);

        cy.signInAsAdmin();

        resyncDatabase({
          dbId: WRITABLE_DB_ID,
        });

        startNewQuestion();
        popover().within(() => {
          cy.findByText("Raw Data").click();
          cy.findByText(dbName).click();
          cy.findByText(schemaName).click();
          cy.findByText(tableName).click();
        });
        visualize();
        saveQuestion("Beasts");

        openNotebook();
        cy.findByTestId("data-step-cell").should("contain", tableName).click();
        popover().within(() => {
          cy.findByTestId("source-database").should("have.text", dbName);
          cy.findByTestId("source-schema").should("have.text", schemaName);
        });
      },
    );

    it("should correctly display a table as the model's source when editing simple model's query", () => {
      cy.visit(`/model/${ORDERS_MODEL_ID}/query`);

      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      popover().within(() => {
        cy.findByTestId("source-database").should(
          "have.text",
          "Sample Database",
        );
        cy.findByLabelText("Orders").should(
          "have.attr",
          "aria-selected",
          "true",
        );
      });
    });
  });

  describe("saved entity as a source (aka the virtual table)", () => {
    const modelDetails: StructuredQuestionDetails = {
      name: "GUI Model",
      query: { "source-table": REVIEWS_ID, limit: 1 },
      display: "table",
      type: "model",
      collection_id: SECOND_COLLECTION_ID,
    };

    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("data selector should properly show a model as the source (metabase#39699)", () => {
      createQuestion(modelDetails, { visitQuestion: true });
      openNotebook();
      cy.findByTestId("data-step-cell")
        .should("have.text", modelDetails.name)
        .click();

      cy.findByTestId("saved-entity-back-navigation").should(
        "have.text",
        "Models",
      );

      cy.findByTestId("saved-entity-collection-tree").within(() => {
        cy.findByLabelText("Our analytics")
          .should("have.attr", "aria-expanded", "false")
          .and("have.attr", "aria-selected", "false");
        cy.findByLabelText("First collection")
          .should("have.attr", "aria-expanded", "true")
          .and("have.attr", "aria-selected", "false");
        cy.findByLabelText("Second collection")
          .should("have.attr", "aria-expanded", "false")
          .and("have.attr", "aria-selected", "true");
      });

      cy.findByTestId("select-list")
        .findByLabelText(checkNotNull(modelDetails.name))
        .should("have.attr", "aria-selected", "true");
    });

    it("moving the model to another collection should immediately be reflected in the data selector (metabase#39812-1)", () => {
      visitModel(ORDERS_MODEL_ID);
      openNotebook();

      openDataSelector();
      assertSourceCollection("Our analytics");
      assertDataSource("Orders Model");

      moveToCollection("First collection");

      openDataSelector();
      assertSourceCollection("First collection");
      assertDataSource("Orders Model");
    });

    it("moving the source question should immediately reflect in the data selector for the nested question that depends on it (metabase#39812-2)", () => {
      const SOURCE_QUESTION_ID = ORDERS_COUNT_QUESTION_ID;
      // Rename the source question to make assertions more explicit
      const sourceQuestionName = "Source Question";
      cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
        name: sourceQuestionName,
      });

      const nestedQuestionDetails = {
        name: "Nested Question",
        query: { "source-table": `card__${SOURCE_QUESTION_ID}` },
      };

      createQuestion(nestedQuestionDetails, {
        wrapId: true,
        idAlias: "nestedQuestionId",
      });

      visitQuestion("@nestedQuestionId");
      openNotebook();

      openDataSelector();
      assertSourceCollection("Our analytics");
      assertDataSource(sourceQuestionName);

      cy.log("Move the source question to another collection");
      visitQuestion(SOURCE_QUESTION_ID);
      openNotebook();
      moveToCollection("First collection");

      cy.log("Make sure the source change is reflected in a nested question");
      visitQuestion("@nestedQuestionId");
      openNotebook();

      openDataSelector();
      assertSourceCollection("First collection");
      assertDataSource(sourceQuestionName);
    });
  });
});

function moveToCollection(collection: string) {
  openQuestionActions();
  popover().findByTextEnsureVisible("Move").click();
  cy.findByRole("dialog").within(() => {
    cy.intercept("GET", "/api/collection/tree**").as("updateCollectionTree");
    cy.findAllByTestId("item-picker-item")
      .filter(`:contains(${collection})`)
      .click();

    cy.button("Move").click();
    cy.wait("@updateCollectionTree");
  });
}

function openDataSelector() {
  cy.findByTestId("data-step-cell").click();
}

function assertItemSelected(item: string) {
  cy.findByLabelText(item).should("have.attr", "aria-selected", "true");
}

function assertSourceCollection(collection: string) {
  return assertItemSelected(collection);
}

function assertDataSource(questionOrModel: string) {
  return assertItemSelected(questionOrModel);
}
