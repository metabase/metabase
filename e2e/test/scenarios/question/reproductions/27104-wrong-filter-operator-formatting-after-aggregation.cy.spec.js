import {
  restore,
  popover,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }]],
    },
    type: "query",
  },
  display: "bar",
};

describe("issue 27104", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should correctly format the filter operator after the aggregation (metabase#27104)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();
    popover().findByText("Count").click();
    popover().within(() => {
      // The following line is the main assertion.
      cy.button("Back").should("have.text", "Count");
      // The rest of the test is not really needed for this reproduction.
      cy.findByDisplayValue("Equal to").click();
    });
    cy.findByRole("listbox").findByText("Greater than").click();
    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("0").blur();
      cy.button("Add filter").click();
    });

    visualize();

    cy.findByTestId("qb-filters-panel").findByText("Count is greater than 0");
    cy.get(".bar").should("have.length", 5);
  });
});
