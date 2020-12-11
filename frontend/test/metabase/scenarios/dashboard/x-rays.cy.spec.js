import { restore, signInAsAdmin } from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

describe("scenarios > x-rays", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should exist on homepage when person first signs in", () => {
    cy.visit("/");
    cy.contains("A look at your People table");
    cy.contains("A look at your Orders table");
    cy.contains("A look at your Products table");
    cy.contains("A look at your Reviews table");
  });

  it("should be populated", () => {
    cy.visit("/");
    cy.findByText("People table").click();

    cy.findByText("Something's gone wrong").should("not.exist");
    cy.findByText("Here's an overview of the people in your People table");
    cy.findByText("Overview");
    cy.findByText("Per state");
    cy.get(".Card").should("have.length", 11);
  });

  it.skip("should work on questions with explicit joins (metabase#13112)", () => {
    const PRODUCTS_ALIAS = "Products";

    cy.request("POST", "/api/card", {
      name: "13112",
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                ["field-id", ORDERS.PRODUCT_ID],
                ["joined-field", PRODUCTS_ALIAS, ["field-id", PRODUCTS.ID]],
              ],
              alias: PRODUCTS_ALIAS,
            },
          ],
          aggregation: [["count"]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
            ["joined-field", PRODUCTS_ALIAS, ["field-id", PRODUCTS.CATEGORY]],
          ],
        },
        database: 1,
      },
      display: "line",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.server();
      cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");
      cy.route("POST", "/api/dataset").as("dataset");

      cy.visit(`/question/${QUESTION_ID}`);

      cy.wait("@cardQuery");
      cy.get(".dot")
        .eq(23) // Random dot
        .click({ force: true });
      cy.findByText("X-ray").click();

      // x-rays take long time even locally - that can timeout in CI so we have to extend it
      cy.wait("@dataset", { timeout: 30000 });
      cy.findByText(
        "A closer look at number of Orders where Created At is in March 2018 and Category is Gadget",
      );
      cy.get(".Icon-warning").should("not.exist");
    });
  });
});
