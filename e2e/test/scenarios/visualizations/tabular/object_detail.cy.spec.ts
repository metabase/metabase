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

describe("scenarios > question > object details", { tags: "@slow" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
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
      cy.findByLabelText("Close").click();
    });
    cy.findByTestId("object-detail").should("not.exist");

    cy.log("Open object details by clicking the PK cell (metabase#27094)");
    // `openObjectDetail` opens row 1's "View details" tooltip with a synthetic
    // hover that never ends, and the tooltip covers row 0's PK cell.
    cy.realPress("Escape");
    drillPK({ id: 1 });
    cy.findByTestId("object-detail").within(() => {
      cy.findByRole("heading", { name: "Awesome Concrete Shoes" }).should(
        "be.visible",
      );
      cy.findByRole("heading", { name: "1" }).should("be.visible");
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

    cy.findByTestId("object-detail")
      .findByRole("link", { name: "77 Orders" })
      .click();
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

  it("handles browsing records by FKs (metabase#21756)", () => {
    cy.intercept(
      { method: "GET", pathname: "/api/action" },
      cy.spy().as("getActions"),
    );
    H.openOrdersTable();

    drillFK({ id: 1 });

    cy.log("ad-hoc questions do not fetch actions (metabase#50266)");
    cy.findByTestId("object-detail")
      .findByRole("link", { name: /Orders/ })
      .should("exist");
    cy.get("@getActions").should("have.callCount", 0);

    assertUserDetailView({ id: 1, heading: "Hudson Borer" });
    getPreviousObjectDetailButton().should("not.exist");
    getNextObjectDetailButton().should("not.exist");

    cy.go("back");
    cy.go("back");
    cy.wait("@dataset");

    changeSorting("User ID", "desc");
    drillFK({ id: 2500 });

    assertUserDetailView({ id: 2500, heading: "Kenny Schmidt" });
    getPreviousObjectDetailButton().should("not.exist");
    getNextObjectDetailButton().should("not.exist");
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

  it("should scroll to the last columns as a viz display type (metabase#29023)", () => {
    H.visitQuestionAdhoc({
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
    });

    cy.findByTestId("object-detail");

    cy.log("metabase(#29023)");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("People → Name").scrollIntoView().should("be.visible");
  });

  describe("issue 41133", () => {
    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
      },
    };

    beforeEach(() => {
      cy.viewport(600, 400);
      H.createQuestion(questionDetails, { visitQuestion: true });
    });

    it("object detail view should be scrollable on narrow screens (metabase#41133)", () => {
      H.openObjectDetail(0);

      // scrollTo fails when the container does not have a scrollable overflow
      H.modal()
        .findByText("is connected to:")
        .parents()
        .filter((_, el) =>
          ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
        )
        .first()
        .scrollTo("bottom");
      H.modal().findByText("is connected to:").should("be.visible");
    });
  });

  describe("detail page links", () => {
    const PEOPLE_FIELDS = [
      ["field", PEOPLE.ADDRESS],
      ["field", PEOPLE.EMAIL],
      ["field", PEOPLE.NAME],
    ];
    const NO_PK_QUERY = {
      "source-table": PEOPLE_ID,
      fields: PEOPLE_FIELDS,
      limit: 5,
    };
    const ONE_PK_QUERY = {
      "source-table": PEOPLE_ID,
      fields: [["field", PEOPLE.ID], ...PEOPLE_FIELDS],
      limit: 5,
    };
    const TWO_PKS_QUERY = {
      ...ONE_PK_QUERY,
      joins: [
        {
          "source-table": ORDERS_ID,
          fields: [["field", ORDERS.ID]],
          strategy: "left-join",
          alias: "Orders",
          condition: ["=", ["field", PEOPLE.ID], ["field", ORDERS.USER_ID]],
        },
      ],
    };

    function visitAdhocQuestion(query: Record<string, unknown>) {
      H.visitQuestionAdhoc({
        display: "table",
        dataset_query: { type: "query", database: SAMPLE_DB_ID, query },
      });
    }

    function assertNoDetailPageLinks() {
      cy.findByTestId("object-detail").within(() => {
        cy.findByLabelText("Close").should("be.visible");
        cy.findByLabelText("Copy link to this record").should("not.exist");
        cy.findByLabelText("Open in full page").should("not.exist");
      });
    }

    beforeEach(() => {
      H.grantClipboardPermissions();
    });

    it("questions", () => {
      cy.log("no primary keys (WRK-900)");
      cy.intercept("GET", `/api/table/${PEOPLE_ID}/fks`).as("peopleFks");
      visitAdhocQuestion(NO_PK_QUERY);
      H.openObjectDetail(0);
      cy.wait("@peopleFks");
      assertNoDetailPageLinks();
      cy.findByTestId("object-detail").within(() => {
        cy.log("should not show relationships when there is no PK (WRK-900)");
        cy.findByText(/is connected to/).should("not.exist");
        cy.findByRole("link", { name: /Orders/ }).should("not.exist");
      });

      cy.log("2 primary keys");
      visitAdhocQuestion(TWO_PKS_QUERY);
      H.openObjectDetail(0);
      assertNoDetailPageLinks();

      cy.log("1 primary key");
      visitAdhocQuestion(ONE_PK_QUERY);
      H.openObjectDetail(0);
      cy.findByTestId("object-detail").within(() => {
        const expectedUrl = `${Cypress.config("baseUrl")}/table/${PEOPLE_ID}-people/detail/1`;

        cy.findByText(/is connected to/).should("be.visible");
        cy.findByRole("link", { name: /Orders/ }).should("be.visible");

        cy.findByLabelText("Copy link to this record").click();
        H.readClipboard().should("equal", expectedUrl);

        cy.findByLabelText("Open in full page").click();
        cy.location("href").should("eq", expectedUrl);
        cy.findByRole("heading", { name: "Hudson Borer" }).should("be.visible");
      });

      cy.log("email values render as mailto links");
      H.DetailView.getDetailsRowValue({ index: 2, rowsCount: 13 }).within(
        () => {
          cy.findByRole("link", { name: "borer-hudson@yahoo.com" }).should(
            "have.attr",
            "href",
            "mailto:borer-hudson@yahoo.com",
          );
        },
      );
    });

    it("models", () => {
      cy.log("no primary keys (WRK-900)");
      H.createQuestion(
        { type: "model", query: NO_PK_QUERY },
        { visitQuestion: true },
      );
      H.openObjectDetail(0);
      assertNoDetailPageLinks();

      cy.log("2 primary keys");
      H.createQuestion(
        { type: "model", query: TWO_PKS_QUERY },
        { visitQuestion: true },
      );
      H.openObjectDetail(0);
      assertNoDetailPageLinks();

      cy.log("1 primary key");
      H.createQuestion({
        type: "model",
        name: "model",
        query: ONE_PK_QUERY,
      }).then(({ body: card }) => {
        const slug = [card.id, card.name].join("-");

        H.visitModel(card.id);
        H.openObjectDetail(0);

        cy.findByTestId("object-detail").within(() => {
          const expectedUrl = `${Cypress.config("baseUrl")}/model/${slug}/detail/1`;

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
  });
});

function drillPK({ id }: { id: number }) {
  cy.get(".test-Table-ID").contains(id).first().click();
}

function drillFK({ id }: { id: number }) {
  cy.get(".test-Table-FK").contains(id).first().click();
  H.popover().findByText("View details").click();
}

type DetailViewOpts = {
  id: number;
  heading?: string;
  subtitle?: string;
  byFK?: boolean;
};

function assertDetailView({
  id,
  heading,
  subtitle,
  byFK = false,
}: DetailViewOpts) {
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

function assertOrderDetailView({ id, heading, subtitle }: DetailViewOpts) {
  assertDetailView({ id, heading, subtitle });
}

function assertUserDetailView({ id, heading, subtitle }: DetailViewOpts) {
  assertDetailView({ id, heading, subtitle, byFK: true });
}

function getPreviousObjectDetailButton() {
  return cy.findByLabelText("Previous row");
}

function getNextObjectDetailButton() {
  return cy.findByLabelText("Next row");
}

function changeSorting(columnName: string, direction: "asc" | "desc") {
  const icon = direction === "asc" ? "arrow_up" : "arrow_down";
  H.tableHeaderClick(columnName);
  H.popover().within(() => {
    cy.icon(icon).click();
  });
  cy.wait("@dataset");
}

["postgres", "mysql"].forEach((dialect) => {
  describe(
    `Object Detail > composite and missing primary keys (${dialect})`,
    { tags: ["@external"] },
    () => {
      beforeEach(() => {
        H.restore(`${dialect}-writable`);
        H.resetTestTable({ type: dialect, table: "composite_pk_table" });
        H.resetTestTable({ type: dialect, table: "no_pk_table" });
        cy.signInAsAdmin();
        H.resyncDatabase({
          dbId: WRITABLE_DB_ID,
          tables: ["composite_pk_table", "no_pk_table"],
        });
      });

      it("can browse object details for items with composite keys and with no primary key", () => {
        cy.log("composite keys");
        H.getTableId({ name: "composite_pk_table" }).then((tableId) => {
          cy.visit(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`);
        });

        H.openObjectDetail(0);

        cy.findByRole("dialog").within(() => {
          cy.findByRole("heading", { name: "Duck" }).should("be.visible");
          cy.findByLabelText("Next row").click();
          cy.findByRole("heading", { name: "Horse" }).should("be.visible");
          cy.findByLabelText("Close").click();
        });
        cy.findByRole("dialog").should("not.exist");

        cy.log(
          "cannot navigate past the end of the list of objects with the keyboard",
        );
        // this bug only manifests on tables without single integer primary keys
        // it is also reproducible on tables with string keys
        H.openObjectDetail(5);

        cy.findByRole("dialog").within(() => {
          cy.findByRole("heading", { name: "Rabbit" }).should("be.visible");
          cy.findByLabelText("Next row").should(
            "have.attr",
            "disabled",
            "disabled",
          );
        });

        cy.get("body").type("{uparrow}");
        cy.findByRole("dialog")
          .findByRole("heading", { name: "Chicken" })
          .should("be.visible");

        cy.get("body").type("{downarrow}");
        cy.findByRole("dialog")
          .findByRole("heading", { name: "Rabbit" })
          .should("be.visible");

        cy.get("body").type("{downarrow}");
        cy.findByRole("dialog").within(() => {
          cy.findByRole("heading", { name: "Rabbit" }).should("be.visible");
          cy.findByText(/couldn't find that record/).should("not.exist");
        });

        cy.log("no primary keys");
        H.getTableId({ name: "no_pk_table" }).then((tableId) => {
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
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("can view an object detail question on a public dashboard and as a public question", () => {
    H.createQuestionAndDashboard({
      questionDetails: { ...TEST_QUESTION, display: "object" },
    }).then(({ body: { card_id, dashboard_id } }) => {
      cy.wrap(card_id).as("questionId");
      // a dashboard card of a saved dashboard has a numeric dashboard id
      H.visitPublicDashboard(Number(dashboard_id));
    });

    cy.findByTestId("object-detail").within(() => {
      cy.findByText("User ID").should("be.visible");
      cy.findByText("1283").should("be.visible");
    });
    cy.icon("warning").should("not.exist");

    cy.findByTestId("pagination-footer").within(() => {
      cy.findByText("Item 1 of 3").should("be.visible");
    });

    cy.log("public question");
    cy.signInAsAdmin();
    cy.get<number>("@questionId").then((questionId) => {
      H.visitPublicQuestion(questionId);
    });

    cy.findByTestId("object-detail").within(() => {
      cy.findByText("User ID").should("be.visible");
      cy.findByText("1283").should("be.visible");
    });
    cy.icon("warning").should("not.exist");

    cy.findByTestId("pagination-footer").within(() => {
      cy.findByText("Item 1 of 3").should("be.visible");
    });
  });
});
