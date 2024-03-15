import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { popover, restore, startNewQuestion } from "e2e/support/helpers";
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
});
