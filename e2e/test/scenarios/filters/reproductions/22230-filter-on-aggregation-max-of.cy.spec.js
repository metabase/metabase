import {
  assertQueryBuilderRowCount,
  restore,
  visitQuestionAdhoc,
  popover,
  visualize,
  queryBuilderMain,
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
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("Max of Name").click();
      cy.findByDisplayValue("Is").click();
    });
    cy.findByRole("listbox").findByText("Starts with").click();

    popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("Zo").blur();
      cy.button("Add filter").click();
    });

    visualize();

    assertQueryBuilderRowCount(2);
    queryBuilderMain(() => {
      cy.findByText("Zora Schamberger").should("be.visible");
      cy.findByText("Zoie Kozey").should("be.visible");
    });
  });
});
