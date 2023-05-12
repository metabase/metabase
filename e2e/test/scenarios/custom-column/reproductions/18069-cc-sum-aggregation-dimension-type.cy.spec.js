import { restore, popover, visualize, summarize } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "18069",
  query: {
    "source-table": PRODUCTS_ID,
    expressions: {
      ["CC_Category"]: ["field", PRODUCTS.CATEGORY, null],
      ["CC_LowerVendor"]: ["lower", ["field", PRODUCTS.VENDOR, null]],
      ["CC_UpperTitle"]: ["upper", ["field", PRODUCTS.TITLE, null]],
      ["CC_HalfPrice"]: ["/", ["field", PRODUCTS.PRICE, null], 2],
      ["CC_ScaledRating"]: ["*", 1.5, ["field", PRODUCTS.RATING, null]],
    },
  },
};

describe("issue 18069", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
  });

  it("should not allow choosing text fields for SUM (metabase#18069)", () => {
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of ...").click();

    popover().within(() => {
      // regular fields
      cy.findByText("Price");
      cy.findByText("Rating");

      // custom columns not suitable for SUM
      cy.findByText("CC_Category").should("not.exist");
      cy.findByText("CC_LowerVendor").should("not.exist");
      cy.findByText("CC_UpperTitle").should("not.exist");

      // custom columns suitable for SUM
      cy.findByText("CC_HalfPrice");
      cy.findByText("CC_ScaledRating").click();
    });

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1,041.45");
  });
});
