import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

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
    it("displays object details with breadcrumbs and relationships", () => {
      DetailView.visitTable(PRODUCTS_ID, 1);

      cy.findByRole("heading", {
        name: "Rustic Paper Wallet",
        level: 1,
      }).should("be.visible");
      cy.findByRole("heading", { name: "1", level: 2 }).should("be.visible");
      cy.icon("document").should("be.visible");

      H.appBar().within(() => {
        cy.findByRole("link", { name: /Sample Database/ })
          .should("be.visible")
          .and("have.attr", "href", `/browse/databases/${SAMPLE_DB_ID}`);
        cy.findByRole("link", { name: "Products" })
          .should("be.visible")
          .and(
            "have.attr",
            "href",
            `/question#?db=${SAMPLE_DB_ID}&table=${PRODUCTS_ID}`,
          );
        cy.findByText("Rustic Paper Wallet").should("be.visible");
      });

      DetailView.verifyDetails([
        ["ID", "1"],
        ["Ean", "1018947080336"],
        ["Title", "Rustic Paper Wallet"],
        ["Category", "Gizmo"],
        ["Vendor", "Swaniawski, Casper and Hilll"],
        ["Price", "29.46"],
        ["Rating", "4.6"],
        ["Created At", "July 19, 2023, 7:44 PM"],
      ]);

      DetailView.getRelationships().within(() => {
        cy.findByText("Rustic Paper Wallet").should("be.visible");
        cy.findByRole("link", { name: "93 Orders" }).should("be.visible");
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

    it("shows loading state and 404 error state", () => {
      DetailView.visitTable(PRODUCTS_ID, 9999);

      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByRole("heading", { name: "Row not found" }).should("be.visible");

      H.appBar().within(() => {
        cy.findByRole("link", { name: /Sample Database/ }).should("be.visible");
        cy.findByRole("link", { name: "Products" }).should("be.visible");
        cy.findByText("9999").should("be.visible");
      });
    });
  });

  describe("model", () => {
    it("displays object details with breadcrumbs", () => {
      createOrdersJoinProductsModel().then(({ body: card }) => {
        DetailView.visitModel(card.id, 1);
        cy.wrap(card.id).as("modelId");
      });

      cy.findByRole("heading", {
        name: "Awesome Concrete Shoes",
        level: 1,
      }).should("be.visible");
      cy.findByRole("heading", { name: "1", level: 2 }).should("be.visible");
      cy.icon("document").should("be.visible");

      H.appBar().within(() => {
        cy.findByRole("link", { name: /First collection/ })
          .should("be.visible")
          .and(
            "have.attr",
            "href",
            `/collection/${FIRST_COLLECTION_ID}-first-collection`,
          );
        cy.findByRole("link", { name: /Second collection/ })
          .should("be.visible")
          .and(
            "have.attr",
            "href",
            `/collection/${SECOND_COLLECTION_ID}-second-collection`,
          );
        cy.get("@modelId").then((modelId) => {
          cy.findByRole("link", { name: /My model/ })
            .should("be.visible")
            .and("have.attr", "href", `/model/${modelId}-my-model`);
        });
        cy.findByText("Awesome Concrete Shoes").should("be.visible");
      });

      DetailView.verifyDetails([
        ["ID", "1"],
        ["User ID", "1"],
        ["Product ID", "14"],
        ["Subtotal", "37.65"],
        ["Tax", "2.07"],
        ["Total", "39.72"],
        ["Discount ($)", "empty"],
        ["Created At", "February 11, 2025, 9:40 PM"],
        ["Quantity", "2"],
        ["Order image", "https://example.com/order/1.jpg"],
        ["Product image", "https://example.com/product/14.jpg"],
        ["Products → Category", "Widget"],
        ["Products → Created At", "December 31, 2023, 2:41 PM"],
        ["Products → Ean", "8833419218504"],
        ["Products → Price", "25.1"],
        ["Products → Rating", "4"],
        ["Products → Title", "Awesome Concrete Shoes"],
        ["Products → Vendor", "McClure-Lockman"],
      ]);

      DetailView.getRelationships().should("not.exist");
    });

    it("shows 404 error state", () => {
      createOrdersJoinProductsModel().then(({ body: card }) => {
        DetailView.visitModel(card.id, 9999);
      });

      cy.findByTestId("loading-indicator").should("be.visible");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findByRole("heading", { name: "Row not found" }).should("be.visible");

      H.appBar().within(() => {
        cy.findByRole("link", { name: /First collection/ }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: /Second collection/ }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: /My model/ }).should("be.visible");
        cy.findByText("9999").should("be.visible");
      });
    });
  });

  describe("value rendering", () => {
    it("respects datamodel remapping and viz settings", () => {
      cy.log("user id - fk remapping");
      H.remapDisplayValueToFK({
        display_value: ORDERS.USER_ID,
        name: "User",
        fk: PEOPLE.NAME,
      });

      cy.log("product id - fk remapping + view as link setting");
      H.remapDisplayValueToFK({
        display_value: ORDERS.PRODUCT_ID,
        name: "Product",
        fk: PRODUCTS.TITLE,
      });
      cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
        settings: {
          view_as: "link",
          link_text: "Product: {{PRODUCT_ID}}",
          link_url: "https://example.com/{{PRODUCT_ID}}",
        },
      });

      cy.log("subtotal - currency_in_header: true");
      cy.request("PUT", `/api/field/${ORDERS.SUBTOTAL}`, {
        semantic_type: "type/Currency",
      });

      cy.log("tax - currency_in_header: false");
      cy.request("PUT", `/api/field/${ORDERS.TAX}`, {
        semantic_type: "type/Currency",
        settings: {
          currency_in_header: false,
        },
      });

      cy.log("total - wrapping very long values");
      cy.request("PUT", `/api/field/${ORDERS.TOTAL}`, {
        settings: {
          prefix: VERY_LONG_STRING,
        },
      });

      cy.log("quantity - custom mapping");
      cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
        settings: {
          has_field_values: "list",
        },
      });
      cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
        name: "Quantity",
        human_readable_field_id: null,
        type: "internal",
      });
      cy.request("GET", `/api/field/${ORDERS.QUANTITY}/values`).then(
        ({ body: response }) => {
          const values = response.values.map(([value]: [number]) => {
            if (value === 2) {
              return [value, "two"];
            }

            return [value, String(value)];
          });

          cy.request("POST", `/api/field/${ORDERS.QUANTITY}/values`, {
            values,
          });
        },
      );

      createOrdersJoinProductsModel().then(({ body: card }) => {
        cy.request("PUT", `/api/card/${card.id}`, {
          result_metadata: card.result_metadata.map((column) => {
            if (
              column.name === "Order image" ||
              column.name === "Product image"
            ) {
              return {
                ...column,
                semantic_type: "type/ImageURL",
                settings: {
                  view_as: "image",
                },
              };
            }

            return column;
          }),
        });

        DetailView.visitModel(card.id, 1);
      });

      DetailView.getHeader().within(() => {
        cy.findByRole("img")
          .should("be.visible")
          .and("have.attr", "src", "https://example.com/order/1.jpg");

        cy.findByRole("heading", {
          name: "Awesome Concrete Shoes",
          level: 1,
        }).should("be.visible");

        cy.findByRole("heading", { name: "1", level: 2 }).should("be.visible");
      });

      DetailView.verifyDetails([
        ["ID", "1"],
        ["User", "Hudson Borer"],
        ["Product", "Product: Awesome Concrete Shoes"],
        ["Subtotal ($)", "37.65"],
        ["Tax", "$2.07"],
        ["Total", `${VERY_LONG_STRING}39.72`],
        ["Discount ($)", "empty"],
        ["Created At", "February 11, 2025, 9:40 PM"],
        ["Quantity", "two"],
        ["Order image", "https://example.com/order/1.jpg"],
        ["Product image", "https://example.com/product/14.jpg"],
        ["Products → Category", "Widget"],
        ["Products → Created At", "December 31, 2023, 2:41 PM"],
        ["Products → Ean", "8833419218504"],
        ["Products → Price", "25.1"],
        ["Products → Rating", "4"],
        ["Products → Title", "Awesome Concrete Shoes"],
        ["Products → Vendor", "McClure-Lockman"],
      ]);

      cy.log("user id remapped to user name");
      DetailView.getDetailsRowValue({ index: 1, rowsCount: 18 }).within(() => {
        cy.findByRole("link", { name: "Hudson Borer" })
          .should("be.visible")
          .and("have.attr", "href", `/table/${PEOPLE_ID}/detail/1`);
      });

      cy.log(
        "product id remapped to product title, and custom view_as setting",
      );
      DetailView.getDetailsRowValue({ index: 2, rowsCount: 18 }).within(() => {
        cy.findByRole("link", { name: "Product: Awesome Concrete Shoes" })
          .should("be.visible")
          .and("have.attr", "href", "https://example.com/14")
          .and("have.attr", "target", "_blank")
          .and("have.attr", "rel", "noopener noreferrer");
      });

      cy.log("very long value without whitespace wraps");
      cy.get("main").should(($main) => {
        expect(H.isScrollableHorizontally($main[0])).to.equal(false);
      });

      cy.log("image should be rendered in a frame with a link");
      DetailView.getDetailsRowValue({ index: 10, rowsCount: 18 }).within(() => {
        cy.findByRole("img")
          .should("exist") // do not wait for image to load
          .and("have.attr", "src", "https://example.com/product/14.jpg");

        cy.findByRole("link")
          .should("exist")
          .and("have.text", "https://example.com/product/14.jpg")
          .and("have.attr", "href", "https://example.com/product/14.jpg")
          .and("have.attr", "target", "_blank")
          .and("have.attr", "rel", "noopener noreferrer");
      });
    });
  });

  it("displays emails as links", () => {
    DetailView.visitTable(PEOPLE_ID, 1);

    DetailView.getDetailsRowValue({ index: 2, rowsCount: 13 }).within(() => {
      cy.findByRole("link", { name: "borer-hudson@yahoo.com" }).should(
        "have.attr",
        "href",
        "mailto:borer-hudson@yahoo.com",
      );
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
