import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SECOND_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { DetailView } = H;
const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

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
        cy.findByRole("link", { name: /Sample Database/ }).should("be.visible");
        cy.findByRole("link", { name: "Products" }).should("be.visible");
        cy.findByText("Rustic Paper Wallet").should("be.visible");
      });

      DetailView.verifyDetails([
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

    it("shows loading state and 404 error state", () => {
      DetailView.visitTable(PRODUCTS_ID, 9999);

      cy.findByTestId("loading-indicator").should("be.visible");
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

      DetailView.verifyDetails([
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
      });
    });
  });

  describe("value rendering", () => {
    it("respects datamodel remapping and viz settings", () => {
      /*
        - [ ] long text wrapping
        - [ ] empty value rendering (empty string + null)
        - [x] pills with links
          - [x] if field has viz settings set to display as link, there should be only 1 link
        - [ ] remapping works
          - [x] FK
          - [ ] custom mapping
        - [ ] images are rendered in a frame and with a link underneath
        - [x] urls/emails are links
        - [ ] shows unit of currency next to column title when "Where to display the unit of currency" is set to "In the column heading"
        */

      cy.log("user id");
      H.remapDisplayValueToFK({
        display_value: ORDERS.USER_ID,
        name: "User",
        fk: PEOPLE.NAME,
      });

      cy.log("product id");
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

      createOrdersJoinProductsModel().then(({ body: card }) => {
        DetailView.visitModel(card.id, 1);
      });

      DetailView.verifyDetails([
        ["User", "Hudson Borer"],
        ["Product", "Product: Awesome Concrete Shoes"],
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

      cy.log("user id remapped to user name");
      DetailView.getDetailsRowValue({ index: 0, rowsCount: 14 }).within(() => {
        cy.findByRole("link", { name: "Hudson Borer" })
          .should("be.visible")
          .and("have.attr", "href", `/table/${PEOPLE_ID}/detail/1`);
      });

      cy.log(
        "product id remapped to product title, and custom view_as setting",
      );
      DetailView.getDetailsRowValue({ index: 1, rowsCount: 14 }).within(() => {
        cy.findByRole("link", { name: "Product: Awesome Concrete Shoes" })
          .should("be.visible")
          .and("have.attr", "href", "https://example.com/14")
          .and("have.attr", "target", "_blank")
          .and("have.attr", "rel", "noopener noreferrer");
      });
    });
  });

  it("displays emails as links", () => {
    DetailView.visitTable(PEOPLE_ID, 1);

    DetailView.getDetailsRowValue({ index: 1, rowsCount: 11 }).within(() => {
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
  });
}
