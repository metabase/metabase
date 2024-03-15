import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  popover,
  restore,
  startNewQuestion,
  openReviewsTable,
  openNotebook,
  visitQuestion,
  resetTestTable,
  resyncDatabase,
  visualize,
  saveQuestion,
} from "e2e/support/helpers";
const { REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > notebook > data source", () => {
  describe("empty app db", () => {
    beforeEach(() => {
      restore("setup");
      cy.signInAsAdmin();
    });

    it("should display tables from the only existing database by default", () => {
      cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/*`).as("dbSchema");

      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByTextEnsureVisible("Question").click();
      cy.wait("@dbSchema");

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
      cy.createQuestion({
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
      cy.createQuestion({
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
  });
});
