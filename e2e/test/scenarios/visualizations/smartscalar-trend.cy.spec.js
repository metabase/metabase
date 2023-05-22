import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > scalar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("trend visualization should work regardless of column order (metabase#13710)", () => {
    cy.createQuestion(
      {
        name: "13710",
        query: {
          "source-table": ORDERS_ID,
          breakout: [
            ["field", ORDERS.QUANTITY, null],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "smartscalar",
      },
      { visitQuestion: true },
    );

    cy.log("Reported failing on v0.35 - v0.37.0.2");
    cy.log("Bug: showing blank visualization");

    cy.get(".ScalarValue").contains("100");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Nothing to compare for the previous month.");
  });
});
