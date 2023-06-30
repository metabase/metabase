import { popover, restore, visitQuestionAdhoc } from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const testQuery = {
  type: "query",
  query: {
    "source-query": {
      "source-table": PEOPLE_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          PEOPLE.LATITUDE,
          { "base-type": "type/Float", binning: { strategy: "default" } },
        ],
        [
          "field",
          PEOPLE.LONGITUDE,
          { "base-type": "type/Float", binning: { strategy: "default" } },
        ],
      ],
    },
  },
  database: SAMPLE_DB_ID,
};

describe("issue 30058", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("visualization does not crash after adding a filter (metabase#30058)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "map",
      displayIsLocked: true,
    });

    cy.icon("notebook").click();
    cy.button("Filter").click();
    popover().within(() => {
      cy.findByText("Count").click();
      cy.icon("chevrondown").click();
    });
    cy.findByTestId("operator-select-list").findByText("Greater than").click();
    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("2");
      cy.findByText("Add filter").click();
    });

    cy.button("Visualize").click();
    cy.wait("@dataset");

    cy.get(".Icon-warning").should("not.exist");
  });
});
