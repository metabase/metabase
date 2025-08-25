import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SECOND_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { DetailView } = H;
const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("detail view", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/table/*/query_metadata*").as("tableMetadata");
  });

  describe("table", () => {
    it("displays object details with relationships and breadcrumbs", () => {
      DetailView.visitTable(PRODUCTS_ID, 1);

      cy.findByRole("heading", {
        name: "Rustic Paper Wallet",
        level: 1,
      }).should("be.visible");
      cy.findByRole("heading", { name: "1", level: 2 }).should("be.visible");
      cy.icon("document").should("be.visible");

      H.appBar().within(() => {
        cy.findByRole("link", { name: /Sample Database/ }).should("be.visible");
        cy.findByRole("link", { name: "Products" }).should("be.visible");
        cy.findByText("Rustic Paper Wallet").should("be.visible");
      });

      DetailView.verifyObjectDetails([
        ["Ean", "1018947080336"],
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

    // it("breadcrumbs", () => {
    //   H.restore("postgres-writable");
    //   H.resetTestTable({ type: "postgres", table: "multi_schema" });
    //   H.resyncDatabase({ dbId: WRITABLE_DB_ID });

    //   DetailView.visitTable(PRODUCTS_ID, 1);
    // });
  });

  describe("model", () => {
    it("displays object details with relationships and breadcrumbs", () => {
      H.createQuestion({
        type: "model",
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
          limit: 5,
        },
        collection_id: SECOND_COLLECTION_ID,
      }).then(({ body: card }) => {
        DetailView.visitModel(card.id, 1);
      });

      cy.findByRole("heading", {
        name: "Awesome Concrete Shoes",
        level: 1,
      }).should("be.visible");
      cy.findByRole("heading", { name: "1", level: 2 }).should("be.visible");
      cy.icon("document").should("be.visible");

      H.appBar().within(() => {
        cy.findByRole("link", { name: /First collection/ }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: /Second collection/ }).should(
          "be.visible",
        );
      });

      DetailView.verifyObjectDetails([
        ["User ID", "1"],
        ["Product ID", "14"],
        ["Subtotal", "37.65"],
        ["Tax", "2.07"],
        ["Total", "39.72"],
        ["Discount ($)", "empty"],
        ["Created At", "February 11, 2025, 9:40 PM"],
        ["Quantity", "2"],
        ["Products → Category", "Widget"],
        ["Products → Created At", "December 31, 2023, 2:41 PM"],
        ["Products → Ean", "8833419218504"],
        ["Products → Price", "25.1"],
        ["Products → Rating", "4"],
        ["Products → Vendor", "McClure-Lockman"],
      ]);

      DetailView.getRelationships().should("not.exist");
    });
  });
});
