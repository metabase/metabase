import {
  getNotebookStep,
  restore,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

const CC_NAME = "CC";

const QUESTION = {
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["avg", ["expression", "CC"]],
        [
          "max",
          [
            "field",
            PEOPLE.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "join-alias": "People",
              "temporal-unit": "month",
            },
          ],
        ],
      ],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
        [
          "field",
          PEOPLE.SOURCE,
          { "base-type": "type/Text", "join-alias": "People" },
        ],
        ["expression", CC_NAME],
      ],
      expressions: {
        [CC_NAME]: ["+", ["field", ORDERS.USER_ID, null], 1],
      },
      joins: [
        {
          alias: "People",
          condition: [
            "=",
            ["expression", CC_NAME],
            ["field", PEOPLE.ID, { "join-alias": "People" }],
          ],
          "source-table": PEOPLE_ID,
        },
      ],
      "order-by": [
        ["asc", ["aggregation", 0]],
        ["asc", ["expression", "CC"]],
        [
          "asc",
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
      ],
    },
  },
};

describe("issue 32625, issue 31635, issue 33288", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove dependent clauses when a clause is removed (metabase#32625, metabase#31635, metabase#33288)", () => {
    visitQuestionAdhoc(QUESTION, { mode: "notebook" });

    getNotebookStep("expression")
      .findAllByTestId("notebook-cell-item")
      .first()
      .icon("close")
      .click();

    getNotebookStep("expression").should("not.exist");
    getNotebookStep("join").should("not.exist");
    getNotebookStep("summarize").within(() => {
      cy.findByText(CC_NAME).should("not.exist");
      cy.findByText(`Average of ${CC_NAME}`).should("not.exist");
      cy.findByText("People → Source").should("not.exist");
      cy.findByText(/nil/).should("not.exist");

      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });
    getNotebookStep("sort").within(() => {
      cy.findByText(CC_NAME).should("not.exist");
      cy.findByText(/nil/).should("not.exist");

      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    visualize();

    cy.findByTestId("query-builder-main").within(() => {
      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );
      cy.findByText("Count").should("exist");
      cy.findByText("Created At").should("exist");
    });
  });
});
