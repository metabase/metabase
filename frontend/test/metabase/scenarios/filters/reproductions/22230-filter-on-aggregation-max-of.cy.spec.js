import {
  restore,
  visitQuestionAdhoc,
  popover,
  visualize,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

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

describe.skip("issue 22230", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be able to filter on an aggregation (metabase#22230)", () => {
    cy.findByText("Filter").click();
    popover().contains("Max of Name").click();

    cy.findByPlaceholderText("Enter some text").type("Zora").blur();
    cy.button("Add filter").click();

    visualize();
    cy.findByText("Zora Schamberger");
  });
});
