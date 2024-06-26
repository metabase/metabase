import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  modal,
  startNewQuestion,
  createQuestion,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 19894", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should show all columns when using the join column selecter (metabase#19894)", () => {
    createQuestion(
      {
        name: "Q1",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
      },
      {
        wrapId: true,
      },
    );

    createQuestion({
      name: "Q2",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["sum", ["field", PRODUCTS.PRICE, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });

    createQuestion({
      name: "Q3",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["avg", ["field", PRODUCTS.RATING, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });

    startNewQuestion();

    modal().findByText("Saved questions").click();
    modal().findByText("Q1").click();

    cy.button("Join data").click();

    modal().findByText("Saved questions").click();
    modal().findByText("Q2").click();

    popover().findByText("Category").click();
    popover().findByText("Category").click();

    cy.button("Join data").click();

    modal().findByText("Saved questions").click();
    modal().findByText("Q3").click();

    popover().findByText("Category").should("be.visible");
    popover().findByText("Count").should("be.visible");

    popover().findByText("Q1").click();
    popover().findByText("Q2").click();

    popover().findByText("Category").should("be.visible");
    popover().findByText("Sum of Price").should("be.visible");

    popover().findByText("Q1").click();

    popover().findByText("Category").should("be.visible");
    popover().findByText("Count").should("be.visible");
  });
});
