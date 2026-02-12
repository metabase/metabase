const { H } = cy;
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

const FIRST_ORDER_ID = 9676;
const SECOND_ORDER_ID = 10874;
const THIRD_ORDER_ID = 11246;

const TEST_QUESTION = {
  query: {
    "source-table": ORDERS_ID,
    filter: [
      "and",
      [">", ["field", ORDERS.TOTAL, null], 149],
      [">", ["field", ORDERS.TAX, null], 10],
      ["not-null", ["field", ORDERS.DISCOUNT, null]],
    ],
  },
};

const TEST_PEOPLE_QUESTION = {
  query: {
    "source-table": PEOPLE_ID,
  },
};

describe("scenarios > question > object details", { tags: "@slow" }, () => {
  before(() => {
    H.restore();
  });

  beforeEach(() => {
    cy.signInAsAdmin();
  });

  it("shows correct object detail card for questions with joins (metabase#27094)", () => {
    const questionDetails = {
      name: "14775",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    drillPK({ id: 1 });

    cy.findByTestId("object-detail").within(() => {
      cy.findByRole("heading", { name: "Awesome Concrete Shoes" }).should(
        "be.visible",
      );
      cy.findByRole("heading", { name: "1" }).should("be.visible");
    });
  });

  it("shows correct object detail card for questions with joins after clicking on view details (metabase#39477)", () => {
    const questionDetails = {
      name: "39477",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
        limit: 2,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    cy.log("Wait for the table to fully render");
    cy.findByTestId("question-row-count").should("have.text", "Showing 2 rows");
    cy.findByTestId("table-header")
      .should("be.visible")
      .and("contain", "Subtotal");
    cy.findByTestId("table-body")
      .should("be.visible")
      .and("contain", "37.65")
      .and("contain", "110.93");

    cy.log("Check object details for the first row");
    H.openObjectDetail(0);
    cy.findByTestId("object-detail").within(() => {
      cy.findByRole("heading", { name: "Awesome Concrete Shoes" }).should(
        "be.visible",
      );
      cy.findByRole("heading", { name: "1" }).should("be.visible");
      cy.findByText("37.65").should("be.visible");
      cy.findByLabelText("Close").click();
    });

    cy.log("Check object details for the second row");
    H.openObjectDetail(1);
    cy.findByTestId("object-detail").within(() => {
      cy.findByRole("heading", { name: "Mediocre Wooden Bench" }).should(
        "be.visible",
      );
      cy.findByRole("heading", { name: "2" }).should("be.visible");
      cy.findByText("110.93").should("be.visible");
    });
  });

  it("applies correct filter (metabase#34070)", () => {
    const questionDetails = {
      name: "34070",
      query: {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }]],
        joins: [
          {
            fields: [["field", REVIEWS.RATING, { "join-alias": "Products" }]],
            alias: "Products",
            condition: [
              "=",
              ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
              [
                "field",
                REVIEWS.PRODUCT_ID,
                { "base-type": "type/BigInteger", "join-alias": "Products" },
              ],
            ],
            "source-table": REVIEWS_ID,
          },
        ],
        limit: 10,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    cy.findByRole("gridcell", { name: "3" }).should("be.visible").click();

    H.modal().findByRole("link", { name: "77 Orders" }).click();
    cy.log("should close the modal when browsing relationships");
    cy.findByTestId("object-detail").should("not.exist");

    cy.findByTestId("qb-filters-panel")
      .findByText("Product ID is 3")
      .should("be.visible");
  });

  it("handles browsing records by PKs", () => {
    H.createQuestion(TEST_QUESTION, { visitQuestion: true });
    drillPK({ id: FIRST_ORDER_ID });

    assertOrderDetailView({
      id: FIRST_ORDER_ID,
      heading: String(FIRST_ORDER_ID),
    });
    getPreviousObjectDetailButton().should("have.attr", "disabled", "disabled");

    getNextObjectDetailButton().click();
    assertOrderDetailView({
      id: SECOND_ORDER_ID,
      heading: String(SECOND_ORDER_ID),
    });

    getNextObjectDetailButton().click();
    assertOrderDetailView({
      id: THIRD_ORDER_ID,
      heading: String(THIRD_ORDER_ID),
    });
    getNextObjectDetailButton().should("have.attr", "disabled", "disabled");

    getPreviousObjectDetailButton().click();
    assertOrderDetailView({
      id: SECOND_ORDER_ID,
      heading: String(SECOND_ORDER_ID),
    });

    getPreviousObjectDetailButton().click();
    assertOrderDetailView({
      id: FIRST_ORDER_ID,
      heading: String(FIRST_ORDER_ID),
    });
  });

  it("calculates a row after both vertical and horizontal scrolling correctly (metabase#51301)", () => {
    H.openPeopleTable();
    H.tableInteractiveScrollContainer().scrollTo(2000, 14900);
    H.openObjectDetail(417);
    cy.findByRole("dialog")
      .should("contain", "418")
      .and("contain", "31942-31950 Oak Ridge Parkway")
      .and("contain", "koss-ella@hotmail.com");
  });

  it("handles browsing records by FKs (metabase#21756)", () => {
    H.openOrdersTable();

    drillFK({ id: 1 });

    assertUserDetailView({ id: 1, name: "Hudson Borer" });
    getPreviousObjectDetailButton().should("not.exist");
    getNextObjectDetailButton().should("not.exist");

    cy.go("back");
    cy.go("back");
    cy.wait("@dataset");

    changeSorting("User ID", "desc");
    drillFK({ id: 2500 });

    assertUserDetailView({ id: 2500, name: "Kenny Schmidt" });
    getPreviousObjectDetailButton().should("not.exist");
    getNextObjectDetailButton().should("not.exist");
  });

  it.skip("handles opening a filtered out record", () => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    const FILTERED_OUT_ID = 1;

    H.createQuestion(TEST_QUESTION).then(({ body: { id } }) => {
      cy.visit(`/question/${id}/${FILTERED_OUT_ID}`);
      cy.wait("@cardQuery");
      cy.findByRole("dialog").within(() => {
        cy.findByText(/We're a little lost/i);
      });
    });
  });

  it.skip("can view details of an out-of-range record", () => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    // since we only fetch 2000 rows, this ID is out of range
    // and has to be fetched separately
    const OUT_OF_RANGE_ID = 2150;

    H.createQuestion(TEST_PEOPLE_QUESTION).then(({ body: { id } }) => {
      cy.visit(`/question/${id}/${OUT_OF_RANGE_ID}`);
      cy.wait("@cardQuery");
      cy.findByTestId("object-detail").within(() => {
        cy.findByRole("heading", { name: "Marcelina Kuhn" }).should(
          "be.visible",
        );
      });
    });
  });

  it("should allow to browse linked entities by FKs (metabase#21757)", () => {
    H.openProductsTable();

    drillPK({ id: 5 });

    cy.findByTestId("object-detail").within(() => {
      cy.findByRole("link", { name: "4 Reviews" }).should("be.visible");
      cy.findByRole("link", { name: "97 Orders" }).should("be.visible");
      cy.findByLabelText("Next row").click();

      cy.findByRole("link", { name: "5 Reviews" }).should("be.visible");
      cy.findByRole("link", { name: "88 Orders" }).should("be.visible");
      cy.findByLabelText("Next row").click();

      cy.findByRole("link", { name: "8 Reviews" }).should("be.visible");
      cy.findByRole("link", { name: "92 Orders" }).should("be.visible").click();
    });
    cy.log("should close the modal when browsing relationships");
    cy.findByTestId("object-detail").should("not.exist");

    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText("Product ID is 7");
    cy.findByTestId("view-footer")
      .findByText("Showing 92 rows")
      .should("be.visible");
  });

  it("should not offer drill-through on the object detail records (metabase#20560)", () => {
    H.openPeopleTable({ limit: 2 });

    drillPK({ id: 2 });
    cy.url().should("contain", "objectId=2");

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findByTestId("object-detail")
      .findAllByText("Domenica Williamson")
      .last()
      .click();
    // Popover is blocking the city. If it renders, Cypress will not be able to click on "Searsboro" and the test will fail.
    // Unfortunately, asserting that the popover does not exist will give us a false positive result.
    cy.findByTestId("object-detail").findByText("Searsboro").click();
  });

  describe("non-numeric IDs (metabase#22768)", () => {
    beforeEach(() => {
      H.restore();
    });

    it("should work with non-numeric IDs (metabase#22768)", () => {
      cy.request("PUT", `/api/field/${PRODUCTS.ID}`, {
        semantic_type: null,
      });

      cy.request("PUT", `/api/field/${PRODUCTS.TITLE}`, {
        semantic_type: "type/PK",
      });

      H.openProductsTable({ limit: 5 });

      H.tableInteractive().findByTextEnsureVisible("Rustic Paper Wallet").click();

      cy.location("search").should("eq", "?objectId=Rustic%20Paper%20Wallet");
      cy.findByTestId("object-detail").contains("Rustic Paper Wallet");
    });
  });

  it("should work as a viz display type", () => {
    const questionDetails = {
      display: "object",
      dataset_query: {
        database: SAMPLE_DB_ID,
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
            {
              fields: "all",
              "source-table": PEOPLE_ID,
              condition: [
                "=",
                ["field", ORDERS.USER_ID, null],
                ["field", PEOPLE.ID, { "join-alias": "People" }],
              ],
              alias: "People",
            },
          ],
        },
        type: "query",
      },
    };
    H.visitQuestionAdhoc(questionDetails);

    cy.findByTestId("object-detail");

    cy.log("metabase(#29023)");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("People → Name").scrollIntoView().should("be.visible");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Item 1 of/i).should("be.visible");
  });

  it("should not call GET /api/action endpoint for ad-hoc questions (metabase#50266)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/action", cy.spy().as("getActions"));

    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Orders" }).click();
    cy.wait("@dataset");
    cy.findAllByTestId("cell-data").eq(11).click();
    H.popover().findByText("View details").click();
    cy.wait(["@dataset", "@dataset", "@dataset"]); // object detail + Orders relationship + Reviews relationship

    cy.get("@getActions").should("have.callCount", 0);
  });

  it("reset object detail navigation state on query change (metabase#54317)", () => {
    const initialFilter = {
      name: "Filter Orders ID < 15",
      query: {
        "source-table": ORDERS_ID,
        filter: ["and", ["<", ["field", ORDERS.ID, null], 15]],
      },
    };

    // Create the question with the initial filter and visit it
    H.createQuestion(initialFilter, { visitQuestion: true });

    // Click object display
    cy.findByTestId("view-footer").within(() => {
      cy.findByText("Visualization").click();
    });

    cy.findByTestId("display-options-sensible");
    cy.icon("document").click();

    // Verify "Item 14 of 14" in the pagination footer
    cy.findByTestId("pagination-footer").within(() => {
      for (let i = 1; i < 14; i++) {
        cy.icon("chevronright").click(); // Click the right arrow
      }
      cy.findByText("Item 14 of 14").should("be.visible");
    });

    // Apply a new filter for order id < 10
    cy.findByTestId("filters-visibility-control").click();
    cy.findByTestId("filter-pill").click();
    cy.findByTestId("number-filter-picker").within(() => {
      cy.findByLabelText("Filter value").clear().type("10");
      cy.findByRole("button", { name: "Update filter" }).click();
    });

    // Verify the pagination footer says "Item 1 of 9"
    cy.findByTestId("pagination-footer").within(() => {
      cy.findByText("Item 1 of 9").should("be.visible");
    });
  });

  describe("view_as column settings (VIZ-199)", () => {
    beforeEach(() => {
      H.restore();
    });

    it("should respect 'view_as' column settings (VIZ-199)", () => {
      cy.request("PUT", `/api/field/${REVIEWS.ID}`, {
        settings: {
          view_as: "link",
          link_text: "Link to review {{ID}}",
          link_url: "https://metabase.test?review={{ID}}",
        },
      });

      H.visitQuestionAdhoc({
        display: "table",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: { "source-table": REVIEWS_ID },
        },
        visualization_settings: {
          column_settings: {
            [JSON.stringify(["name", "RATING"])]: {
              view_as: "link",
              link_text: "Rating: {{RATING}}",
              link_url: "https://metabase.test?rating={{RATING}}",
            },
          },
        },
      });

      H.openObjectDetail(0);

      cy.findByTestId("object-detail").within(() => {
        cy.findAllByText("Link to review 1")
          .should("have.length", 2)
          .and("be.visible")
          .and("have.attr", "href")
          .and("eq", "https://metabase.test?review=1");

        cy.findByText("Rating: 5")
          .should("be.visible")
          .and("have.attr", "href")
          .and("eq", "https://metabase.test?rating=5");
      });

      cy.findByLabelText("Next row").click();

      cy.findByTestId("object-detail").within(() => {
        cy.findAllByText("Link to review 2")
          .should("have.length", 2)
          .and("be.visible")
          .and("have.attr", "href")
          .and("eq", "https://metabase.test?review=2");

        cy.findByText("Rating: 4")
          .should("be.visible")
          .and("have.attr", "href")
          .and("eq", "https://metabase.test?rating=4");
      });
    });
  });

  it("should support keyboard navigation and opened row highlighting", () => {
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PEOPLE_ID },
      },
    });

    getObjectDetailShortcut(0).icon("sidebar_open").should("be.visible");

    getRow(0).should("have.css", "background-color", "rgba(0, 0, 0, 0)");
    H.openObjectDetail(0);
    getRow(0).should("not.have.css", "background-color", "rgba(0, 0, 0, 0)");
    cy.findByTestId("object-detail")
      .findByRole("heading", { name: "Hudson Borer" })
      .should("be.visible");

    cy.log("navigates down");
    getRow(1).should("have.css", "background-color", "rgba(0, 0, 0, 0)");
    cy.realPress("ArrowDown");
    getRow(1).should("not.have.css", "background-color", "rgba(0, 0, 0, 0)");
    cy.findByTestId("object-detail")
      .findByRole("heading", { name: "Domenica Williamson" })
      .should("be.visible");

    cy.log("navigates up");
    getRow(0).should("have.css", "background-color", "rgba(0, 0, 0, 0)");
    cy.realPress("ArrowUp");
    getRow(0).should("not.have.css", "background-color", "rgba(0, 0, 0, 0)");
    cy.findByTestId("object-detail")
      .findByRole("heading", { name: "Hudson Borer" })
      .should("be.visible");

    cy.log("does not navigate outside of bounds");
    cy.realPress("ArrowUp");
    getRow(0).should("not.have.css", "background-color", "rgba(0, 0, 0, 0)");
    cy.findByTestId("object-detail")
      .findByRole("heading", { name: "Hudson Borer" })
      .should("be.visible");
  });

  it("should support toggling the sidebar", () => {
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PEOPLE_ID },
      },
    });

    getObjectDetailShortcut(0).icon("sidebar_open").should("be.visible");
    H.openObjectDetail(0);

    // realHover does not work behind the modal overlay, so we're working around it with realMouseMove
    getRow(0).then(($row) => {
      const rect = $row[0].getBoundingClientRect();
      const detailShortcutWidth = 24;
      const detailShortcutOffset = 10;
      const x = detailShortcutOffset + detailShortcutWidth / 2;
      const y = rect.height / 2;

      getRow(0).realMouseMove(x, y, { scrollBehavior: false });
      getRow(0)
        .findByTestId("detail-shortcut")
        .icon("sidebar_closed")
        .should("be.visible");
      H.tooltip().should("be.visible").and("contain.text", "Hide details");

      getRow(0).realClick({ x, y, scrollBehavior: false });
      getRow(0)
        .findByTestId("detail-shortcut")
        .icon("sidebar_open")
        .should("be.visible");
      H.tooltip().should("be.visible").and("contain.text", "View details");
    });
  });

  it("should respect viz settings column order and visibility", () => {
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PEOPLE_ID },
      },
    });

    H.openVizSettingsSidebar();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("Address-hide-button").click();

      cy.findAllByRole("listitem")
        .eq("7")
        .as("stateItem")
        .should("have.text", "State");
      H.moveDnDKitElementByAlias("@stateItem", { vertical: -300 });
    });

    H.openObjectDetail(0);

    cy.findByTestId("object-detail").within(() => {
      cy.log("hidden columns are not shown");
      cy.findByText("Address").should("not.exist");

      cy.log("viz settings columns order is respected");
      cy.findAllByText(/State|Email/).then(($elements) => {
        const texts = $elements
          .map((_index, element) => element.textContent)
          .get();

        expect(texts.indexOf("State")).to.be.lessThan(texts.indexOf("Email"));
      });
    });
  });

  describe("detail page links - questions", () => {
    it("no primary keys (WRK-900)", () => {
      H.visitQuestionAdhoc({
        display: "table",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ADDRESS],
              ["field", PEOPLE.EMAIL],
              ["field", PEOPLE.NAME],
            ],
            limit: 5,
          },
        },
      });

      H.openObjectDetail(0);
      cy.findByTestId("object-detail").within(() => {
        cy.findByLabelText("Copy link to this record").should("not.exist");
        cy.findByLabelText("Open in full page").should("not.exist");

        cy.log("should not show relationships when there is no PK (WRK-900)");
        cy.findByText(/is connected to/).should("not.exist");
        cy.findByRole("link", { name: /Orders/ }).should("not.exist");
      });
    });

    it("1 primary key", () => {
      H.grantClipboardPermissions();
      H.visitQuestionAdhoc({
        display: "table",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ID],
              ["field", PEOPLE.ADDRESS],
              ["field", PEOPLE.EMAIL],
              ["field", PEOPLE.NAME],
            ],
            limit: 5,
          },
        },
      });

      H.openObjectDetail(0);
      cy.findByTestId("object-detail").within(() => {
        const expectedUrl = `http://localhost:4000/table/${PEOPLE_ID}/detail/1`;

        cy.findByLabelText("Copy link to this record").click();
        H.readClipboard().should("equal", expectedUrl);

        cy.findByLabelText("Open in full page").click();
        cy.location("href").should("eq", expectedUrl);
        cy.findByRole("heading", { name: "Hudson Borer" }).should("be.visible");
      });
    });

    it("2 primary keys", () => {
      H.visitQuestionAdhoc({
        display: "table",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ID],
              ["field", PEOPLE.ADDRESS],
              ["field", PEOPLE.EMAIL],
              ["field", PEOPLE.NAME],
            ], //["field", ORDERS.ID],
            joins: [
              {
                "source-table": ORDERS_ID,
                fields: [["field", ORDERS.ID]],
                strategy: "left-join",
                alias: "Orders",
                condition: [
                  "=",
                  ["field", PEOPLE.ID],
                  ["field", ORDERS.USER_ID],
                ],
              },
            ],
            limit: 5,
          },
        },
      });

      H.openObjectDetail(0);
      cy.findByTestId("object-detail").within(() => {
        cy.findByLabelText("Copy link to this record").should("not.exist");
        cy.findByLabelText("Open in full page").should("not.exist");
      });
    });
  });

  describe("detail page links - models", () => {
    it("no primary keys (WRK-900)", () => {
      H.createQuestion(
        {
          type: "model",
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ADDRESS],
              ["field", PEOPLE.EMAIL],
              ["field", PEOPLE.NAME],
            ],
            limit: 5,
          },
        },
        { visitQuestion: true },
      );

      H.openObjectDetail(0);
      cy.findByTestId("object-detail").within(() => {
        cy.findByLabelText("Copy link to this record").should("not.exist");
        cy.findByLabelText("Open in full page").should("not.exist");

        cy.log("should not show relationships when there is no PK (WRK-900)");
        cy.findByText(/is connected to/).should("not.exist");
        cy.findByRole("link", { name: /Orders/ }).should("not.exist");
      });
    });

    it("1 primary key", () => {
      H.grantClipboardPermissions();
      H.createQuestion({
        type: "model",
        name: "model",
        query: {
          "source-table": PEOPLE_ID,
          fields: [
            ["field", PEOPLE.ID],
            ["field", PEOPLE.ADDRESS],
            ["field", PEOPLE.EMAIL],
            ["field", PEOPLE.NAME],
          ],
          limit: 5,
        },
      }).then(({ body: card }) => {
        const slug = [card.id, card.name].join("-");

        H.visitModel(card.id);
        H.openObjectDetail(0);

        cy.findByTestId("object-detail").within(() => {
          const expectedUrl = `http://localhost:4000/model/${slug}/detail/1`;

          cy.findByLabelText("Copy link to this record").click();
          H.readClipboard().should("equal", expectedUrl);

          cy.findByLabelText("Open in full page").click();
          cy.location("href").should("eq", expectedUrl);
          cy.findByRole("heading", { name: "Hudson Borer" }).should(
            "be.visible",
          );
        });
      });
    });

    it("2 primary keys", () => {
      H.createQuestion(
        {
          type: "model",
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ID],
              ["field", PEOPLE.ADDRESS],
              ["field", PEOPLE.EMAIL],
              ["field", PEOPLE.NAME],
            ],
            joins: [
              {
                "source-table": ORDERS_ID,
                fields: [["field", ORDERS.ID]],
                strategy: "left-join",
                alias: "Orders",
                condition: [
                  "=",
                  ["field", PEOPLE.ID],
                  ["field", ORDERS.USER_ID],
                ],
              },
            ],
            limit: 5,
          },
        },
        { visitQuestion: true },
      );

      H.openObjectDetail(0);
      cy.findByTestId("object-detail").within(() => {
        cy.findByLabelText("Copy link to this record").should("not.exist");
        cy.findByLabelText("Open in full page").should("not.exist");
      });
    });
  });
});

function getObjectDetailShortcut(rowIndex) {
  return getRow(rowIndex)
    .realHover({ scrollBehavior: false })
    .findByTestId("detail-shortcut")
    .should("be.visible");
}

function getRow(rowIndex) {
  return cy.get(`[data-index=${rowIndex}]`);
}

function drillPK({ id }) {
  cy.get(".test-Table-ID").contains(id).first().click();
}

function drillFK({ id }) {
  cy.get(".test-Table-FK").contains(id).first().click();
  H.popover().findByText("View details").click();
}

function assertDetailView({ id, heading, subtitle, byFK = false }) {
  if (heading) {
    cy.findByRole("heading", { name: heading }).should("be.visible");
  }

  if (subtitle) {
    cy.findByRole("heading", { name: subtitle }).should("be.visible");
  }

  const pattern = byFK
    ? new RegExp("/question#*")
    : new RegExp(`/question/[1-9]d*.*/${id}`);

  cy.url().should("match", pattern);
}

function assertOrderDetailView({ id, heading, subtitle }) {
  assertDetailView({ id, heading, subtitle });
}

function assertUserDetailView({ id, heading, subtitle }) {
  assertDetailView({ id, heading, subtitle, byFK: true });
}

function getPreviousObjectDetailButton() {
  return cy.findByLabelText("Previous row");
}

function getNextObjectDetailButton() {
  return cy.findByLabelText("Next row");
}

function changeSorting(columnName, direction) {
  const icon = direction === "asc" ? "arrow_up" : "arrow_down";
  H.tableHeaderClick(columnName);
  H.popover().within(() => {
    cy.icon(icon).click();
  });
  cy.wait("@dataset");
}

["postgres", "mysql"].forEach((dialect) => {
  describe(
    `Object Detail > composite keys (${dialect})`,
    { tags: ["@external"] },
    () => {
      const TEST_TABLE = "composite_pk_table";

      beforeEach(() => {
        H.restore(`${dialect}-writable`);
        H.resetTestTable({ type: dialect, table: TEST_TABLE });
        cy.signInAsAdmin();
        H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      });

      it("can show object detail modal for items with composite keys", () => {
        H.getTableId({ name: TEST_TABLE }).then((tableId) => {
          cy.visit(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`);
        });

        H.openObjectDetail(0);

        cy.findByRole("dialog").within(() => {
          cy.findByRole("heading", { name: "Duck" }).should("be.visible");
          cy.findByLabelText("Next row").click();
          cy.findByRole("heading", { name: "Horse" }).should("be.visible");
        });
      });

      it("cannot navigate past the end of the list of objects with the keyboard", () => {
        // this bug only manifests on tables without single integer primary keys
        // it is also reproducible on tables with string keys

        H.getTableId({ name: TEST_TABLE }).then((tableId) => {
          cy.visit(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`);
        });

        H.openObjectDetail(5);

        cy.findByRole("dialog").within(() => {
          cy.findByRole("heading", { name: "Rabbit" }).should("be.visible");
        });

        cy.get("body").type("{downarrow}");

        cy.findByRole("dialog").within(() => {
          cy.findByRole("heading", { name: "Rabbit" }).should("be.visible");
          cy.findByText("Empty").should("not.exist");
        });
      });
    },
  );

  describe(
    `Object Detail > no primary keys (${dialect})`,
    { tags: ["@external"] },
    () => {
      const TEST_TABLE = "no_pk_table";

      beforeEach(() => {
        H.restore(`${dialect}-writable`);
        H.resetTestTable({ type: dialect, table: TEST_TABLE });
        cy.signInAsAdmin();
        H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      });

      it("can show object detail modal for items with no primary key", () => {
        H.getTableId({ name: TEST_TABLE }).then((tableId) => {
          cy.visit(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`);
        });

        H.openObjectDetail(0);

        cy.findByRole("dialog").within(() => {
          cy.findByRole("heading", { name: "Duck" }).should("be.visible");
          cy.findByLabelText("Next row").click();
          cy.findByRole("heading", { name: "Horse" }).should("be.visible");
        });
      });
    },
  );
});

describe("Object Detail > public", () => {
  before(() => {
    H.restore();
  });

  beforeEach(() => {
    cy.signInAsAdmin();
  });

  it("can view a public object detail question", () => {
    H.createQuestion({ ...TEST_QUESTION, display: "object" }).then(
      ({ body: { id: questionId } }) => {
        H.visitPublicQuestion(questionId);
      },
    );
    cy.icon("warning").should("not.exist");

    cy.findByTestId("object-detail").within(() => {
      cy.findByText("User ID").should("be.visible");
      cy.findByText("1283").should("be.visible");
    });

    cy.findByTestId("pagination-footer").within(() => {
      cy.findByText("Item 1 of 3").should("be.visible");
    });
  });

  it("can view an object detail question on a public dashboard", () => {
    H.createQuestionAndDashboard({
      questionDetails: { ...TEST_QUESTION, display: "object" },
    }).then(({ body: { dashboard_id } }) => {
      H.visitPublicDashboard(dashboard_id);
    });

    cy.icon("warning").should("not.exist");

    cy.findByTestId("object-detail").within(() => {
      cy.findByText("User ID").should("be.visible");
      cy.findByText("1283").should("be.visible");
    });

    cy.findByTestId("pagination-footer").within(() => {
      cy.findByText("Item 1 of 3").should("be.visible");
    });
  });
});

describe("issue 66957", () => {
  before(() => {
    H.restore();
  });

  beforeEach(() => {
    cy.signInAsNormalUser();
    H.openOrdersTable();
  });

  it("filter header should not hide when opening object details (metabase#66957)", () => {
    H.tableInteractive().findByText("Quantity").click();
    H.popover().findByText("Filter by this column").click();
    H.popover().within(() => {
      cy.findByText("2").click();
      cy.button("Add filter").click();
    });

    H.openObjectDetail(5);

    H.queryBuilderFiltersPanel()
      .should("be.visible")
      .findByText("Quantity is equal to 2")
      .click();

    H.popover().within(() => {
      cy.findByText("3").click();
      cy.button("Update filter").click();
    });

    H.queryBuilderFiltersPanel()
      .findByText("Quantity is equal to 2 selections")
      .should("be.visible");
  });
});
