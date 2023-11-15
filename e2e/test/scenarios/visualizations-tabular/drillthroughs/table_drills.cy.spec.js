import { openReviewsTable, popover, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > drillthroughs > table_drills", function () {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display proper drills on cell click for unaggregated query", () => {
    openReviewsTable({ limit: 3 });

    // FK cell drills
    cy.get(".Table-FK").findByText("1").first().click();
    popover().within(() => {
      cy.findByText(`View this Product's Reviews`).should("be.visible");
      cy.findByText(`View details`).should("be.visible");
    });

    // Short text cell drills
    cy.get(".cellData").contains("christ").click();
    popover().within(() => {
      cy.findByText(`Is christ`).should("be.visible");
      cy.findByText(`Is not christ`).should("be.visible");
      cy.findByText(`View details`).should("be.visible");
    });

    // Number cell drills
    cy.get(".cellData").contains("5").first().click();
    popover().within(() => {
      cy.findByText(`>`).should("be.visible");
      cy.findByText(`<`).should("be.visible");
      cy.findByText(`=`).should("be.visible");
      cy.findByText(`≠`).should("be.visible");
      cy.findByText(`View details`).should("be.visible");
    });

    cy.get(".cellData").contains("Ad perspiciatis quis").click();
    popover().within(() => {
      cy.findByText(`Contains…`).should("be.visible");
      cy.findByText(`Does not contain…`).should("be.visible");
      cy.findByText(`View details`).should("be.visible");
    });

    cy.get(".cellData").contains("May 15, 20").click();
    popover().within(() => {
      cy.findByText(`Before`).should("be.visible");
      cy.findByText(`After`).should("be.visible");
      cy.findByText(`On`).should("be.visible");
      cy.findByText(`Not on`).should("be.visible");
      cy.findByText(`View details`).should("be.visible");
    });

    cy.get(".cellData").contains("ID").click({ force: true });
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText(`Filter by this column`).should("be.visible");
      cy.findByText(`Distinct values`).should("be.visible");
    });

    cy.get(".cellData").contains("Reviewer").click();
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText(`Filter by this column`).should("be.visible");
      cy.findByText(`Distribution`).should("be.visible");
      cy.findByText(`Distinct values`).should("be.visible");
    });

    cy.get(".cellData").contains("Rating").click();
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText(`Filter by this column`).should("be.visible");
      cy.findByText(`Sum over time`).should("be.visible");
      cy.findByText(`Distribution`).should("be.visible");

      cy.findByText(`Sum`).should("be.visible");
      cy.findByText(`Avg`).should("be.visible");
      cy.findByText(`Distinct values`).should("be.visible");
    });
  });

  it(`should display proper drills on cell click for query aggregated by category`, () => {
    cy.createQuestion(
      {
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [["field", REVIEWS.REVIEWER, null]],
          limit: 10,
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("TableInteractive-root")
      .findByText("abbey-heidenreich")
      .click();

    popover().within(() => {
      cy.findByText(`Is abbey-heidenreich`).should("be.visible");
      cy.findByText(`Is not abbey-heidenreich`).should("be.visible");
    });

    cy.get(".cellData").contains("1").first().click();
    popover().within(() => {
      cy.findByText(`See this Review`).should("be.visible");

      cy.findByText(`Automatic insights…`).should("be.visible");

      cy.findByText(`>`).should("be.visible");
      cy.findByText(`<`).should("be.visible");
      cy.findByText(`=`).should("be.visible");
      cy.findByText(`≠`).should("be.visible");
    });

    cy.get(".cellData").contains("Reviewer").click();
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText(`Filter by this column`).should("be.visible");
    });

    cy.get(".cellData").contains("Count").click();
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText(`Filter by this column`).should("be.visible");
    });
  });

  it(`should display proper drills on cell click for query aggregated by date`, () => {
    cy.createQuestion(
      {
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }],
          ],
          limit: 10,
        },
      },
      { visitQuestion: true },
    );

    cy.get(".cellData").contains("June").first().click();
    popover().within(() => {
      cy.findByText(`Before`).should("be.visible");
      cy.findByText(`After`).should("be.visible");
      cy.findByText(`On`).should("be.visible");
      cy.findByText(`Not on`).should("be.visible");
    });

    cy.get(".cellData").contains("4").first().click();
    popover().within(() => {
      cy.findByText(`See this month by week`).should("be.visible");

      cy.findByText(`Break out by…`).should("be.visible");
      cy.findByText(`Automatic insights…`).should("be.visible");

      cy.findByText(`>`).should("be.visible");
      cy.findByText(`<`).should("be.visible");
      cy.findByText(`=`).should("be.visible");
      cy.findByText(`≠`).should("be.visible");
    });

    cy.findByTestId("timeseries-chrome").within(() => {
      cy.findByText(`View`).should("be.visible");
      cy.findByText(`All time`).should("be.visible");
      cy.findByText(`by`).should("be.visible");
      cy.findByText(`Month`).should("be.visible");
    });
  });

  it(`should display proper drills for native query`, () => {
    cy.createNativeQuestion(
      {
        name: "table_drills",
        native: { query: `select * from orders limit 3` },
      },
      { visitQuestion: true },
    );

    cy.get(".cellData").contains("1").first().click();
    popover()
      .findByText(`Drill-through doesn’t work on SQL questions.`)
      .should("be.visible");
  });
});
