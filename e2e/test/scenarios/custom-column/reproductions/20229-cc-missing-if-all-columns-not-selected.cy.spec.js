import { restore, popover, visualize } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "20229",
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      Adjective: [
        "case",
        [[[">", ["field", ORDERS.TOTAL, null], 100], "expensive"]],
        { default: "cheap" },
      ],
    },
    limit: 10,
  },
};

describe("issue 20229", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should display custom column regardless of how many columns are selected (metabase#20229)", () => {
    ccAssertion();

    // Switch to the notebook view to deselect at least one column
    cy.icon("notebook").click();

    cy.findAllByTestId("fields-picker").click();
    popover().within(() => {
      unselectColumn("Tax");
    });

    visualize();

    ccAssertion();
  });
});

function ccAssertion() {
  cy.findByText("Adjective");
  cy.contains("expensive");
  cy.contains("cheap");
}

function unselectColumn(column) {
  cy.findByText(column).siblings().find(".Icon-check").click({ force: true });
}
