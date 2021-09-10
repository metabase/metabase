import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

const categoryFilter = {
  id: "00315d5e-4a41-99da-1a41-e5254dacff9d",
  name: "category",
  "display-name": "Category",
  type: "dimension",
  default: "Doohickey",
  dimension: ["field", PRODUCTS.CATEGORY, null],
  "widget-type": "category",
};

const productIdFilter = {
  id: "4775bccc-e82a-4069-fc6b-2acc90aadb8b",
  name: "prodid",
  "display-name": "ProdId",
  type: "number",
  default: null,
};

const nativeQuery = {
  name: "13961",
  native: {
    query:
      "SELECT * FROM PRODUCTS WHERE 1=1 AND {{category}} [[AND ID={{prodid}}]]",
    "template-tags": {
      category: categoryFilter,
      prodid: productIdFilter,
    },
  },
};

describe.skip("issue 13961", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery).then(({ body }) => {
      cy.intercept("POST", `/api/card/${body.id}/query`).as("cardQuery");

      cy.visit(`/question/${body.id}`);
      cy.wait("@cardQuery");
    });
  });

  it("should clear default filter value in native questions (metabase#13961)", () => {
    cy.findAllByText("Small Marble Shoes"); // Product ID 2, Doohickey

    cy.location("search").should("eq", "?category=Doohickey");

    // Remove default filter (category)
    cy.get("fieldset .Icon-close").click();

    cy.icon("play")
      .first()
      .should("be.visible")
      .as("rerunQuestion")
      .click();
    cy.wait("@cardQuery");

    cy.url().should("not.include", "?category=Doohickey");

    // Add value `1` to the ID filter
    cy.findByPlaceholderText(productIdFilter["display-name"]).type("1");

    cy.get("@rerunQuestion").click();
    cy.wait("@cardQuery");

    cy.log("Reported tested and failing on v0.34.3 through v0.37.3");
    cy.log("URL is correct at this point, but there are no results");

    cy.location("search").should("eq", `?${productIdFilter.name}=1`);
    cy.findByText("Rustic Paper Wallet"); // Product ID 1, Gizmo
  });
});
