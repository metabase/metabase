import {
  restore,
  visitQuestionAdhoc,
  popover,
  visualize,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PEOPLE_ID,
      aggregation: [["max", ["field", PEOPLE.NAME, null]]],
      breakout: [["field", PEOPLE.SOURCE, null]],
    },
    type: "query",
    display: "table",
  },
};

describe("issue 22230", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be able to filter on an aggregation (metabase#22230)", () => {
    cy.findByText("Filter").click();
    popover().contains("Max of Name").click();
    cy.findByTestId("select-button").click();
    cy.findByRole("option", { name: "Starts with" }).click();

    cy.findByPlaceholderText("Enter some text").type("Zo").blur();
    cy.button("Add filter").click();

    visualize();
    cy.findByText("Showing 2 rows").should("be.visible");
    cy.findByText("Zora Schamberger").should("be.visible");
    cy.findByText("Zoie Kozey").should("be.visible");
  });
});
