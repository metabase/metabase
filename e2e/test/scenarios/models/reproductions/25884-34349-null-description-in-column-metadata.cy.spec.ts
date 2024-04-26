import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  openQuestionActions,
  popover,
  restore,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const ID_DESCRIPTION =
  "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.";

describe("issues 25884 and 34349", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show empty description input for columns without description in metadata (metabase#25884, metabase#34349)", () => {
    createQuestion(
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

    cy.findByLabelText("Description").should("have.text", ID_DESCRIPTION);

    cy.findAllByTestId("header-cell").contains("Country").click();
    cy.findByLabelText("Description").should("have.text", "");

    cy.findAllByTestId("header-cell").contains("ID").click();
    cy.findByLabelText("Description").should("have.text", ID_DESCRIPTION);
  });
});
