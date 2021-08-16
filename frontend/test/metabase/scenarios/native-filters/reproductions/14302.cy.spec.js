import { restore } from "__support__/e2e/cypress";

const priceFilter = {
  id: "39b51ccd-47a7-9df6-a1c5-371918352c79",
  name: "PRICE",
  "display-name": "Price",
  type: "number",
  default: "10",
  required: true,
};

const nativeQuery = {
  name: "14302",
  native: {
    query:
      'SELECT "CATEGORY", COUNT(*)\nFROM "PRODUCTS"\nWHERE "PRICE" > {{PRICE}}\nGROUP BY "CATEGORY"',
    "template-tags": {
      PRICE: priceFilter,
    },
  },
};

describe("issue 14302", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery).then(({ body }) => {
      cy.intercept("POST", `/api/card/${body.id}/query`).as("cardQuery");

      cy.visit(`/question/${body.id}`);
      cy.wait("@cardQuery");
    });
  });

  it("should not make the question dirty when there are no changes (metabase#14302)", () => {
    cy.log("Reported on v0.37.5 - Regression since v0.37.0");

    cy.findByText("Save").should("not.exist");
  });
});
