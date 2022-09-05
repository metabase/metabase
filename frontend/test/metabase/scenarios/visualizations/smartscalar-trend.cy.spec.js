import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
    cy.findByText("Nothing to compare for the previous month.");
  });

  it.skip("should display correct trend percentage (metabase#20488)", () => {
    const questionDetails = {
      native: {
        query:
          "SELECT parsedatetime('2020-12-31', 'yyyy-MM-dd'), 1000\nUNION ALL\nSELECT parsedatetime('2021-12-31', 'yyyy-MM-dd'), 1",
        "template-tags": {},
      },
      display: "smartscalar",
    };

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.get(".ScalarValue").invoke("text").should("eq", "1");

    cy.icon("arrow_down");

    cy.get(".SmartWrapper")
      .should("contain", "99,900%")
      .and("contain", "was 1,000 last year");
  });
});
