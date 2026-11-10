import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SECOND_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { DetailView } = H;
const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

const VERY_LONG_STRING = "VERY_LONG_STRING_".repeat(10);

describe("detail view", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("table", () => {
    it("opens a row and its related records in the query builder", () => {
      DetailView.visitTable(PRODUCTS_ID, 1);

      cy.findByRole("heading", {
        name: "Rustic Paper Wallet",
        level: 1,
      }).should("be.visible");

      DetailView.verifyDetails([
        ["ID", "1"],
        ["Ean", "1018947080336"],
        ["Title", "Rustic Paper Wallet"],
        ["Category", "Gizmo"],
        ["Vendor", "Swaniawski, Casper and Hilll"],
        ["Price", "29.46"],
        ["Rating", "4.6"],
        ["Created At", "July 19, 2026, 7:44 PM"],
      ]);

      DetailView.getRelationships().within(() => {
        cy.findByRole("link", { name: "8 Reviews" })
          .should("be.visible")
          .click();
      });

      H.queryBuilderHeader().findByText("Reviews").should("be.visible");
      H.queryBuilderFiltersPanel().children().should("have.length", 1);
      H.queryBuilderFiltersPanel()
        .findByText("Product ID is 1")
        .should("be.visible");
      cy.findByTestId("question-row-count")
        .should("be.visible")
        .and("have.text", "Showing 8 rows");
    });
  });

  describe("model", () => {
    it("displays object details of a row", () => {
      createOrdersJoinProductsModel().then(({ body: card }) => {
        DetailView.visitModel(card.id, 1);
      });

      cy.findByRole("heading", {
        name: "Awesome Concrete Shoes",
        level: 1,
      }).should("be.visible");

      DetailView.verifyDetails([
        ["ID", "1"],
        ["User ID", "1"],
        ["Product ID", "14"],
        ["Subtotal", "37.65"],
        ["Tax", "2.07"],
        ["Total", "39.72"],
        ["Discount ($)", "empty"],
        ["Created At", "February 11, 2028, 9:40 PM"],
        ["Quantity", "2"],
        ["Order image", "https://example.com/order/1.jpg"],
        ["Product image", "https://example.com/product/14.jpg"],
        ["Products → Category", "Widget"],
        ["Products → Created At", "December 31, 2026, 2:41 PM"],
        ["Products → Ean", "8833419218504"],
        ["Products → Price", "25.1"],
        ["Products → Rating", "4"],
        ["Products → Title", "Awesome Concrete Shoes"],
        ["Products → Vendor", "McClure-Lockman"],
      ]);
    });
  });

  describe("value rendering", () => {
    it("applies datamodel remapping, field settings, and model column settings", () => {
      H.remapDisplayValueToFK({
        display_value: ORDERS.USER_ID,
        name: "User",
        fk: PEOPLE.NAME,
      });

      cy.request("PUT", `/api/field/${ORDERS.TOTAL}`, {
        settings: {
          prefix: VERY_LONG_STRING,
        },
      });

      createOrdersJoinProductsModel().then(({ body: card }) => {
        cy.request("PUT", `/api/card/${card.id}`, {
          result_metadata: card.result_metadata.map((column) =>
            column.name === "Order image"
              ? {
                  ...column,
                  semantic_type: "type/ImageURL",
                  settings: { view_as: "image" },
                }
              : column,
          ),
        });

        DetailView.visitModel(card.id, 1);
      });

      DetailView.getHeader()
        .findByRole("img")
        .should("have.attr", "src", "https://example.com/order/1.jpg");

      DetailView.getDetailsRowColumnName({ index: 1, rowsCount: 18 }).should(
        "have.text",
        "User",
      );
      DetailView.getDetailsRowValue({ index: 1, rowsCount: 18 }).within(() => {
        cy.findByRole("link", { name: "Hudson Borer" })
          .should("be.visible")
          .and("have.attr", "href", `/table/${PEOPLE_ID}/detail/1`);
      });

      DetailView.getDetailsRowValue({ index: 5, rowsCount: 18 }).should(
        "have.text",
        `${VERY_LONG_STRING}39.72`,
      );

      cy.log("very long value without whitespace wraps");
      cy.get("main").should(($main) => {
        expect(H.isScrollableHorizontally($main[0])).to.be.false;
      });
    });
  });
});

function createOrdersJoinProductsModel() {
  return H.createQuestion({
    type: "model",
    name: "My model",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: [
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
            ["field", PRODUCTS.CREATED_AT, { "join-alias": "Products" }],
            ["field", PRODUCTS.EAN, { "join-alias": "Products" }],
            ["field", PRODUCTS.PRICE, { "join-alias": "Products" }],
            ["field", PRODUCTS.RATING, { "join-alias": "Products" }],
            ["field", PRODUCTS.TITLE, { "join-alias": "Products" }],
            ["field", PRODUCTS.VENDOR, { "join-alias": "Products" }],
          ],
          strategy: "left-join",
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, {}],
            ["field", PRODUCTS.ID, {}],
          ],
          "source-table": PRODUCTS_ID,
        },
      ],
      expressions: {
        "Order image": [
          "concat",
          "https://example.com/order/",
          ["field", ORDERS.ID],
          ".jpg",
        ],
        "Product image": [
          "concat",
          "https://example.com/product/",
          ["field", ORDERS.PRODUCT_ID],
          ".jpg",
        ],
      },
      limit: 5,
    },
    collection_id: SECOND_COLLECTION_ID,
  });
}
