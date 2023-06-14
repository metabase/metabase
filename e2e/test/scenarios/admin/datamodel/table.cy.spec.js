import { restore, filter, visitQuestion } from "e2e/support/helpers";
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > databases > table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should see 8 tables in sample database", () => {
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    cy.get(".AdminList-item").should("have.length", 8);
  });

  it("should be able to see details of each table", () => {
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Select any table to see its schema and add or edit metadata.",
    );

    // Orders
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Select any table to see its schema and add or edit metadata.",
    ).should("not.exist");
    cy.get(
      "input[value='Confirmed Sample Company orders for a product, from a user.']",
    );
  });

  it("should show 404 if database does not exist (metabase#14652)", () => {
    cy.visit("/admin/datamodel/database/54321");
    cy.get(".AdminList-item").should("have.length", 0);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not found.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a database");
  });

  describe("in orders table", () => {
    beforeEach(() => {
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
      );
    });

    it("should see multiple fields", () => {
      cy.get("input[value='User ID']");
      cy.findAllByText("Foreign Key");

      cy.get("input[value='Tax']");
      cy.findAllByText("No semantic type");

      cy.get("input[value='Discount']");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Discount");
    });

    it("should see the id field", () => {
      cy.get("input[value='ID']");
      cy.findAllByText("Entity Key");
    });

    it("should see the created_at timestamp field", () => {
      cy.get("input[value='Created At']");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Creation timestamp");
    });
  });

  describe.skip("turning table visibility off shouldn't prevent editing related question (metabase#15947)", () => {
    it("simple question (metabase#15947-1)", () => {
      turnTableVisibilityOff(ORDERS_ID);
      visitQuestion(ORDERS_QUESTION_ID);
      filter();
    });

    it("question with joins (metabase#15947-2)", () => {
      cy.createQuestion({
        name: "15947",
        query: {
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
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        turnTableVisibilityOff(PRODUCTS_ID);
        cy.visit(`/question/${QUESTION_ID}/notebook`);
        cy.findByText("Products");
        cy.findByText("Quantity is equal to 1");
        cy.findByText("Rating is greater than 3");
      });
    });
  });
});

function turnTableVisibilityOff(table_id) {
  cy.request("PUT", "/api/table", {
    ids: [table_id],
    visibility_type: "hidden",
  });
}
