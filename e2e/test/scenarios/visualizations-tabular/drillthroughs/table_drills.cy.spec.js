import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  openReviewsTable,
  popover,
  restore,
  tableHeaderClick,
  openTable,
} from "e2e/support/helpers";

const { REVIEWS, REVIEWS_ID, ACCOUNTS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > drillthroughs > table_drills", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(1500, 800);
  });

  it("should display proper drills on cell click for unaggregated query", () => {
    openReviewsTable({ limit: 3 });

    // FK cell drills
    cy.get(".test-Table-FK").findByText("1").first().click();
    popover().within(() => {
      cy.findByText("View this Product's Reviews").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    // Short text cell drills
    cy.get("[data-testid=cell-data]").contains("christ").click();
    popover().within(() => {
      cy.findByText("Is christ").should("be.visible");
      cy.findByText("Is not christ").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    // Number cell drills
    cy.get("[data-testid=cell-data]").contains("5").first().click();
    popover().within(() => {
      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    cy.get("[data-testid=cell-data]").contains("Ad perspiciatis quis").click();
    popover().within(() => {
      cy.findByText("Contains…").should("be.visible");
      cy.findByText("Does not contain…").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    cy.get("[data-testid=cell-data]").contains("May 15, 20").click();
    popover().within(() => {
      cy.findByText("Before").should("be.visible");
      cy.findByText("After").should("be.visible");
      cy.findByText("On").should("be.visible");
      cy.findByText("Not on").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    tableHeaderClick("ID");
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
      cy.findByText("Distinct values").should("be.visible");
    });

    //cy.get("[data-testid=cell-data]").contains("Reviewer").click();
    tableHeaderClick("Reviewer");
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
      cy.findByText("Distribution").should("be.visible");
      cy.findByText("Distinct values").should("be.visible");
    });

    // cy.get("[data-testid=cell-data]").contains("Rating").click();
    tableHeaderClick("Rating");
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
      cy.findByText("Sum over time").should("be.visible");
      cy.findByText("Distribution").should("be.visible");

      cy.findByText("Sum").should("be.visible");
      cy.findByText("Avg").should("be.visible");
      cy.findByText("Distinct values").should("be.visible");
    });
  });

  it("should display proper drills on cell click for query aggregated by category", () => {
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
      cy.findByText("Is abbey-heidenreich").should("be.visible");
      cy.findByText("Is not abbey-heidenreich").should("be.visible");
    });

    cy.get("[data-testid=cell-data]").contains("1").first().click();
    popover().within(() => {
      cy.findByText("See this Review").should("be.visible");

      cy.findByText("Automatic insights…").should("be.visible");

      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
    });

    tableHeaderClick("Reviewer");
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
    });

    tableHeaderClick("Count");
    popover().within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
    });
  });

  it("should display proper drills on cell click for query aggregated by date", () => {
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

    cy.get("[data-testid=cell-data]").contains("June").first().click();
    popover().within(() => {
      cy.findByText("Before").should("be.visible");
      cy.findByText("After").should("be.visible");
      cy.findByText("On").should("be.visible");
      cy.findByText("Not on").should("be.visible");
    });

    cy.get("[data-testid=cell-data]").contains("4").first().click();
    popover().within(() => {
      cy.findByText("See this month by week").should("be.visible");

      cy.findByText("Break out by…").should("be.visible");
      cy.findByText("Automatic insights…").should("be.visible");

      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
    });

    cy.findByTestId("timeseries-chrome").within(() => {
      cy.findByText("View").should("be.visible");
      cy.findByText("All time").should("be.visible");
      cy.findByText("by").should("be.visible");
      cy.findByText("Month").should("be.visible");
    });
  });

  it("should display proper drills for native query", () => {
    cy.createNativeQuestion(
      {
        name: "table_drills",
        native: { query: "select * from orders limit 3" },
      },
      { visitQuestion: true },
    );

    cy.get("[data-testid=cell-data]").contains("1").first().click();
    popover()
      .findByText("Drill-through doesn’t work on SQL questions.")
      .should("be.visible");
  });
});

describe("scenarios > visualizations > drillthroughs > table_drills > nulls", () => {
  beforeEach(() => {
    // It's important to restore to the "setup" to have access to "Accounts" table
    restore("setup");
    cy.signInAsAdmin();
    cy.viewport(1500, 800);
  });

  it("should display proper drills on a datetime cell click when there is no value (metabase#44101)", () => {
    const CANCELLED_AT_INDEX = 9;

    openTable({ table: ACCOUNTS_ID, limit: 1 });
    cy.findAllByRole("gridcell")
      .eq(CANCELLED_AT_INDEX)
      .should("have.text", "")
      .click({ force: true });

    popover().within(() => {
      cy.findByText("Filter by this date").should("be.visible");
      cy.findByText("Is empty").should("be.visible");
      cy.findByText("Not empty").should("be.visible").click();
    });

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Canceled At is not empty",
    );
    cy.findAllByRole("gridcell")
      .eq(CANCELLED_AT_INDEX)
      .should("not.have.text", "");
  });
});
