import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { openQuestionActions, popover, restore } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 34349", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show empty description input for columns without description in metadata (metabase#34349)", () => {
    cy.createQuestion(
      {
        type: "model",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Country: ["substring", "United States", 1, 20],
          },
          fields: [
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            ["expression", "Country", { "base-type": "type/Text" }],
          ],
          limit: 5, // optimization
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();
    cy.findByLabelText("Description").should(
      "have.text",
      "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
    );
    cy.findAllByTestId("header-cell").contains("Country").click();
    cy.findByLabelText("Description").should("have.text", "");
  });
});
