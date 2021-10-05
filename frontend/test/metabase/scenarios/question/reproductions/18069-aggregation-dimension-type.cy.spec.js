import { restore, popover } from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

describe("issue 18069", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should not allow choosing text fields for SUM (metabase#18069)", () => {
    cy.createQuestion({
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
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);

      cy.findByText("Summarize").click();
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

      cy.button("Visualize").click();
      cy.wait("@dataset");
      cy.findByText("1,041.45");
    });
  });
});
