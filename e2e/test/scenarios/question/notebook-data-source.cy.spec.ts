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
  entityPickerModal,
  entityPickerModalItem,
  entityPickerModalLevel,
  entityPickerModalTab,
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
      entityPickerModal().within(() => {
        cy.findAllByRole("tab").should("have.length", 2);
        entityPickerModalTab("Models").and(
          "have.attr",
          "aria-selected",
          "true",
        );
        entityPickerModalTab("Tables").should("exist");
        entityPickerModalTab("Saved questions").should("not.exist");
      });
    });

    it("should not show models if only saved questions exist", () => {
      createQuestion({
        name: "GUI Question",
        query: { "source-table": REVIEWS_ID, limit: 1 },
        display: "table",
      });

      startNewQuestion();
      entityPickerModal().within(() => {
        cy.findAllByRole("tab").should("have.length", 2);
        entityPickerModalTab("Models").should("not.exist");
        entityPickerModalTab("Tables").and(
          "have.attr",
          "aria-selected",
          "true",
        );
        entityPickerModalTab("Saved questions").should("exist");
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
      entityPickerModal().within(() => {
        entityPickerModalTab("Recents").and(
          "have.attr",
          "aria-selected",
          "true",
        );
        cy.findByTestId("result-item")
          .should("contain.text", "Reviews")
          .and("have.attr", "data-model-type", "table");

        entityPickerModalTab("Tables").click();
        // should not show databases step if there's only 1 database
        entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected(2, "Reviews");
      });
    });

    it("should correctly display the source data for a simple saved question", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").and(
          "have.attr",
          "aria-selected",
          "true",
        );
        // should not show databases step if there's only 1 database
        entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected(2, "Orders");
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
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
          cy.findByText(dbName).click();
          cy.findByText(schemaName).click();
          cy.findByText(tableName).click();
        });
        visualize();
        saveQuestion("Beasts");

        openNotebook();
        cy.findByTestId("data-step-cell").should("contain", tableName).click();
        entityPickerModal().within(() => {
          assertDataPickerEntitySelected(0, dbName);
          assertDataPickerEntitySelected(1, schemaName);
          assertDataPickerEntitySelected(2, tableName);
        });
      },
    );

    it("should correctly display a table as the model's source when editing simple model's query", () => {
      cy.visit(`/model/${ORDERS_MODEL_ID}/query`);

      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        // should not show databases step if there's only 1 database
        entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected(2, "Orders");
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

      entityPickerModal().within(() => {
        entityPickerModalTab("Models").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, "Second collection");
        assertDataPickerEntitySelected(3, checkNotNull(modelDetails.name));
      });
    });

    it("moving the model to another collection should immediately be reflected in the data selector (metabase#39812-1)", () => {
      visitModel(ORDERS_MODEL_ID);
      openNotebook();

      openDataSelector();
      entityPickerModal().within(() => {
        entityPickerModalTab("Models").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "Orders Model");
        cy.button("Close").click();
      });

      moveToCollection("First collection");

      openDataSelector();
      entityPickerModal().within(() => {
        entityPickerModalTab("Models").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, "Orders Model");
      });
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
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, sourceQuestionName);
        cy.button("Close").click();
      });

      cy.log("Move the source question to another collection");
      visitQuestion(SOURCE_QUESTION_ID);
      openNotebook();
      moveToCollection("First collection");

      cy.log("Make sure the source change is reflected in a nested question");
      visitQuestion("@nestedQuestionId");
      openNotebook();

      openDataSelector();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, sourceQuestionName);
      });
    });
  });
});

function moveToCollection(collection: string) {
  cy.intercept("GET", "/api/collection/tree**").as("updateCollectionTree");

  openQuestionActions();
  popover().findByTextEnsureVisible("Move").click();

  entityPickerModal().within(() => {
    cy.findByText(collection).click();
    cy.button("Move").click();
    cy.wait("@updateCollectionTree");
  });
}

function openDataSelector() {
  cy.findByTestId("data-step-cell").click();
}

function assertDataPickerEntitySelected(level: number, name: string) {
  entityPickerModalItem(level, name).should("have.attr", "data-active", "true");
}
