import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const PIVOT_QUESTION = {
  name: "Pivot table with custom column width",
  display: "pivot",
  query: {
    "source-table": ORDERS_ID,
    breakout: [
      [
        "field",
        ORDERS.TOTAL,
        { "base-type": "type/Float", binnig: { strategy: "default" } },
      ],
    ],
    aggregation: [
      ["distinct", ["field", ORDERS.ID, { "base-type": "type/BigInteger" }]],
    ],
    limit: 10,
  },
  visualization_settings: {
    "pivot_table.column_split": {
      rows: [
        [
          "field",
          ORDERS.TOTAL,
          {
            "base-type": "type/Float",
            binnig: {
              strategy: "num-bins",
              "min-value": 0,
              "max-value": 160,
              "num-bins": 8,
              "bin-width": 20,
            },
          },
        ],
      ],
      columns: [],
      values: [["aggregation", 0]],
    },
    "pivot_table.column_widths": {
      leftHeaderWidths: [80],
      totalLeftHeaderWidths: 80,
      valueHeaderWidths: { 0: 193 },
    },
  },
};

describe("issue 37726", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not result in an error when you add a column after resizing an existing one (#37726)", () => {
    cy.intercept("POST", "/api/dataset/pivot").as("pivot");

    // The important data point in this question is that it has custom
    // leftHeaderWidths as if a user had dragged them to change the defaults.
    cy.createQuestion(PIVOT_QUESTION, { visitQuestion: true });

    // Now, add in another column to the pivot table
    cy.button("Summarize").click();

    cy.findByRole("listitem", { name: "Category" })
      .realHover()
      .button("Add dimension")
      .click();

    cy.wait("@pivot");
    waitToFinishLoading();

    cy.findByTestId("pivot-table").findByText("Product → Category");

    // Refresh the page -- this loads the question using the transient value
    cy.reload();

    cy.wait("@pivot");
    waitToFinishLoading();
    // Look for the new column name in the resulting pivot table.
    // Note that before this fix, the page would error out and this elements,
    // along with the rest of the pivot table, would not appear.
    // Instead, you got a nice ⚠️ icon and a "Something's gone wrong" tooltip.
    cy.findByTestId("pivot-table").findByText("Product → Category");
  });
});

function waitToFinishLoading() {
  cy.get("main")
    .findByText(/loading|doing science/i)
    .should("not.exist");
}
