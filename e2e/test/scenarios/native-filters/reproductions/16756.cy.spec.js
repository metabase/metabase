import { restore, filterWidget, popover } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import { runQuery } from "../helpers/e2e-sql-filter-helpers";

const { PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "16756",
  native: {
    query: "select * from PRODUCTS where {{filter}}",
    "template-tags": {
      filter: {
        id: "d3643bc3-a8f3-e015-8c83-d2ea50bfdf22",
        name: "filter",
        "display-name": "Filter",
        type: "dimension",
        dimension: ["field", PRODUCTS.CREATED_AT, null],
        "widget-type": "date/range",
        default: null,
      },
    },
  },
};

describe("issue 16756", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept("POST", `/api/card/**/${id}/query`).as("cardQuery");

      cy.visit(`/question/${id}?filter=2018-03-31~2019-03-31`);

      cy.wait("@cardQuery");
    });
  });

  it("should allow switching between date filter types (metabase#16756)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open editor/i).click();
    cy.icon("variable").click();

    // Update the filter widget type
    cy.findByTestId("sidebar-right").findByText("Date Range").click();

    popover().contains("Single Date").click();

    // The previous filter value should reset
    cy.location("search").should("eq", "");

    // Set the date to the 15th of whichever the month and year are when this tests runs
    filterWidget().click();

    popover().contains("15").click();

    cy.button("Update filter").click();

    runQuery();

    // We expect "No results"
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No results!");
  });
});
