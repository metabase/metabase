import { leftSidebar, queryBuilderMain, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;
describe("issue 31743", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it(`should support line chart zoom for binned dates - "month-of-year" (metabase#31743)`, () => {
    prepareLineChart("month-of-year");

    // drag across to filter
    cy.get(".Visualization")
      .trigger("mousedown", 120, 200)
      .trigger("mousemove", 330, 200)
      .trigger("mouseup", 330, 200);

    cy.findByTestId("qb-filters-panel")
      .findByText(`Created At between 0.46523894212238215 2.7555128785983327`)
      .should("be.visible");

    cy.get(".LineAreaBarChart").within(() => {
      cy.findByText("January").should("be.visible");
      cy.findByText("February").should("be.visible");
    });

    queryBuilderMain().findByText("Month of year").should("be.visible");
  });

  it(`should support line chart zoom for binned dates - "day-of-week" (metabase#31743)`, () => {
    prepareLineChart("day-of-week");

    // drag across to filter
    cy.get(".Visualization")
      .trigger("mousedown", 120, 200)
      .trigger("mousemove", 430, 200)
      .trigger("mouseup", 430, 200);

    cy.findByTestId("qb-filters-panel")
      .findByText(`Created At between 0.35998539366111937 2.3992466915966215`)
      .should("be.visible");

    cy.get(".LineAreaBarChart").within(() => {
      cy.findByText("Sunday").should("be.visible");
      cy.findByText("Monday").should("be.visible");
    });

    queryBuilderMain().findByText("Day of week").should("be.visible");
  });
});

function prepareLineChart(temporalUnit) {
  cy.createQuestion(
    {
      query: {
        "source-table": ORDERS_ID,
        dataset: true,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": temporalUnit }],
        ],
      },
    },
    { visitQuestion: true },
  );

  cy.findByTestId("viz-type-button").click();

  leftSidebar().within(() => {
    cy.icon("line").click();
    cy.button("Done").click();
  });
}
