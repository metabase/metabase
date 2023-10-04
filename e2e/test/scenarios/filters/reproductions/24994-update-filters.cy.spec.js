import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-query": {
      "source-table": PRODUCTS_ID,
      filter: [
        "and",
        ["=", ["field", PRODUCTS.CATEGORY, null], "Gadget", "Gizmo"],
        [
          "time-interval",
          ["field", PRODUCTS.CREATED_AT, null],
          -30,
          "year",
          {
            include_current: false,
          },
        ],
      ],
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    filter: [
      ">",
      [
        "field",
        "count",
        {
          "base-type": "type/Integer",
        },
      ],
      0,
    ],
  },
};

describe("issue 24994", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow updating filters (metabase#24994)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    // Three filters
    cy.findByTestId("filters-visibility-control").contains("3").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is 2 selections").click();
    assertFilterValueIsSelected("Gadget");
    assertFilterValueIsSelected("Gizmo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey").click();
    assertFilterValueIsSelected("Doohickey");
    cy.button("Update filter").should("not.be.disabled").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is 3 selections");
  });
});

function assertFilterValueIsSelected(value) {
  cy.findByTestId(`${value}-filter-value`).within(() =>
    cy.get("input").should("be.checked"),
  );
}
