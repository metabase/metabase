import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("visual tests > models > editor", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  describe("GUI query", () => {
    it("renders query editor correctly", () => {
      cy.createQuestion({
        name: "GUI Model",
        dataset: true,
        query: GUI_QUERY,
      }).then(({ body: { id: MODEL_ID } }) => {
        cy.visit(`/model/${MODEL_ID}/query`);
        cy.wait("@cardQuery");
        cy.findByText(/Doing science/).should("not.exist");
        cy.wait(100); // waits for the colums widths calculation
        cy.percySnapshot(
          "visual tests > models > editor > GUI query > renders query editor correctly",
        );
      });
    });

    it("renders metadata editor correctly", () => {
      cy.createQuestion({
        name: "GUI Model",
        dataset: true,
        query: GUI_QUERY,
      }).then(({ body: { id: MODEL_ID } }) => {
        cy.visit(`/model/${MODEL_ID}/metadata`);
        cy.wait("@cardQuery");
        cy.findByText(/Doing science/).should("not.exist");
        cy.wait(100); // waits for the colums widths calculation
        cy.percySnapshot(
          "visual tests > models > editor > GUI query > renders metadata editor correctly",
        );
      });
    });
  });

  describe("native query", () => {
    it("renders query editor correctly", () => {
      cy.createNativeQuestion({
        name: "Native Model",
        dataset: true,
        native: {
          query: "SELECT * FROM orders",
        },
      }).then(({ body: { id: MODEL_ID } }) => {
        cy.visit(`/model/${MODEL_ID}/query`);
        cy.wait("@cardQuery");
        cy.findByText(/Doing science/).should("not.exist");
        cy.percySnapshot(
          "visual tests > models > editor > native query > renders query editor correctly",
        );
      });
    });

    it("renders metadata editor correctly", () => {
      cy.createNativeQuestion({
        name: "Native Model",
        dataset: true,
        native: {
          query: "SELECT * FROM orders",
        },
      }).then(({ body: { id: MODEL_ID } }) => {
        cy.visit(`/model/${MODEL_ID}/metadata`);
        cy.wait("@cardQuery");
        cy.findByText(/Doing science/).should("not.exist");
        cy.wait(100); // waits for the colums widths calculation
        cy.percySnapshot(
          "visual tests > models > editor > native query > renders metadata editor correctly",
        );
      });
    });
  });
});

const GUI_QUERY = {
  "source-table": ORDERS_ID,
  joins: [
    {
      fields: "all",
      "source-table": PRODUCTS_ID,
      condition: [
        "=",
        ["field", ORDERS.PRODUCT_ID, null],
        ["field", PRODUCTS.ID, { "join-alias": "Products" }],
      ],
      alias: "Products",
    },
  ],
  filter: [
    "and",
    ["=", ["field", ORDERS.QUANTITY, null], 1],
    [">", ["field", PRODUCTS.RATING, { "join-alias": "Products" }], 3],
  ],
  aggregation: [
    ["sum", ["field", ORDERS.TOTAL, null]],
    ["sum", ["field", PRODUCTS.RATING, { "join-alias": "Products" }]],
  ],
  breakout: [
    ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
    ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
  ],
};
