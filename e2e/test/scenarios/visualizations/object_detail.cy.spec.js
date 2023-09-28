import {
  restore,
  popover,
  openOrdersTable,
  openPeopleTable,
  openProductsTable,
  visitQuestionAdhoc,
  resetTestTable,
  resyncDatabase,
  getTableId,
  visitPublicQuestion,
  visitPublicDashboard,
} from "e2e/support/helpers";

import { WRITABLE_DB_ID, SAMPLE_DB_ID } from "e2e/support/cypress_data";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

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
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shows correct object detail card for questions with joins (metabase #27094)", () => {
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

    cy.createQuestion(questionDetails, { visitQuestion: true });

    drillPK({ id: 1 });

    cy.findByTestId("object-detail").within(() => {
      cy.get("h2").should("contain", "Order").should("contain", 1);
    });
  });

  it("handles browsing records by PKs", () => {
    cy.createQuestion(TEST_QUESTION, { visitQuestion: true });
    drillPK({ id: FIRST_ORDER_ID });

    assertOrderDetailView({ id: FIRST_ORDER_ID });
    getPreviousObjectDetailButton().should("have.attr", "disabled", "disabled");

    getNextObjectDetailButton().click();
    assertOrderDetailView({ id: SECOND_ORDER_ID });

    getNextObjectDetailButton().click();
    assertOrderDetailView({ id: THIRD_ORDER_ID });
    getNextObjectDetailButton().should("have.attr", "disabled", "disabled");

    getPreviousObjectDetailButton().click();
    assertOrderDetailView({ id: SECOND_ORDER_ID });

    getPreviousObjectDetailButton().click();
    assertOrderDetailView({ id: FIRST_ORDER_ID });
  });

  it("handles browsing records by FKs (metabase#21756)", () => {
    openOrdersTable();

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

  it("handles opening a filtered out record", () => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    const FILTERED_OUT_ID = 1;

    cy.createQuestion(TEST_QUESTION).then(({ body: { id } }) => {
      cy.visit(`/question/${id}/${FILTERED_OUT_ID}`);
      cy.wait("@cardQuery");
      cy.findByRole("dialog").within(() => {
        cy.findByText(/We're a little lost/i);
      });
    });
  });

  it("can view details of an out-of-range record", () => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    // since we only fetch 2000 rows, this ID is out of range
    // and has to be fetched separately
    const OUT_OF_RANGE_ID = 2150;

    cy.createQuestion(TEST_PEOPLE_QUESTION).then(({ body: { id } }) => {
      cy.visit(`/question/${id}/${OUT_OF_RANGE_ID}`);
      cy.wait("@cardQuery");
      cy.findByTestId("object-detail").within(() => {
        // should appear in header and body of the modal
        cy.findAllByText(/Marcelina Kuhn/i).should("have.length", 2);
      });
    });
  });

  it("should allow to browse linked entities by FKs (metabase#21757)", () => {
    const PRODUCT_ID = 7;
    const EXPECTED_LINKED_ORDERS_COUNT = 92;
    const EXPECTED_LINKED_REVIEWS_COUNT = 8;
    openProductsTable();

    drillPK({ id: 5 });

    cy.findByTestId("object-detail").within(() => {
      cy.findByTestId("fk-relation-orders").findByText(97);
      cy.findByTestId("fk-relation-reviews").findByText(4);
      cy.findByTestId("view-next-object-detail").click();

      cy.findByTestId("fk-relation-orders").findByText(88);
      cy.findByTestId("fk-relation-reviews").findByText(5);
      cy.findByTestId("view-next-object-detail").click();

      cy.findByTestId("fk-relation-reviews").findByText(
        EXPECTED_LINKED_REVIEWS_COUNT,
      );
      cy.findByTestId("fk-relation-orders")
        .findByText(EXPECTED_LINKED_ORDERS_COUNT)
        .click();
    });

    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      `Product ID is ${PRODUCT_ID}`,
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`Showing ${EXPECTED_LINKED_ORDERS_COUNT} rows`);
  });

  it("should fetch linked entities data only once per entity type when reopening the modal (metabase#32720)", () => {
    cy.intercept("POST", "/api/dataset", cy.spy().as("fetchDataset"));

    openProductsTable();
    cy.get("@fetchDataset").should("have.callCount", 1);

    drillPK({ id: 5 });
    cy.get("@fetchDataset").should("have.callCount", 3);

    cy.realPress("{esc}");

    drillPK({ id: 5 });
    cy.get("@fetchDataset").should("have.callCount", 5);

    cy.wait(100);
    cy.get("@fetchDataset").should("have.callCount", 5);
  });

  it("should not offer drill-through on the object detail records (metabase#20560)", () => {
    openPeopleTable({ limit: 2 });

    drillPK({ id: 2 });
    cy.url().should("contain", "objectId=2");

    cy.findByTestId("object-detail")
      .findAllByText("Domenica Williamson")
      .last()
      .click();
    // Popover is blocking the city. If it renders, Cypress will not be able to click on "Searsboro" and the test will fail.
    // Unfortunately, asserting that the popover does not exist will give us a false positive result.
    cy.findByTestId("object-detail").findByText("Searsboro").click();
  });

  it("should work with non-numeric IDs (metabse#22768)", () => {
    cy.request("PUT", `/api/field/${PRODUCTS.ID}`, {
      semantic_type: null,
    });

    cy.request("PUT", `/api/field/${PRODUCTS.TITLE}`, {
      semantic_type: "type/PK",
    });

    openProductsTable({ limit: 5 });

    cy.findByTestId("TableInteractive-root")
      .findByTextEnsureVisible("Rustic Paper Wallet")
      .click();

    cy.location("search").should("eq", "?objectId=Rustic%20Paper%20Wallet");
    cy.findByTestId("object-detail").contains("Rustic Paper Wallet");
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
    visitQuestionAdhoc(questionDetails);

    cy.findByTestId("object-detail");

    cy.log("metabase(#29023)");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("People → Name").scrollIntoView().should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Item 1 of/i).should("be.visible");
  });
});

function drillPK({ id }) {
  cy.get(".Table-ID").contains(id).first().click();
}

function drillFK({ id }) {
  cy.get(".Table-FK").contains(id).first().click();
  popover().findByText("View details").click();
}

function assertDetailView({ id, entityName, byFK = false }) {
  cy.get("h2").should("contain", entityName).should("contain", id);

  const pattern = byFK
    ? new RegExp("/question#*")
    : new RegExp(`/question/[1-9]d*.*/${id}`);

  cy.url().should("match", pattern);
}

function assertOrderDetailView({ id }) {
  assertDetailView({ id, entityName: "Order" });
}

function assertUserDetailView({ id, name }) {
  assertDetailView({ id, entityName: name, byFK: true });
}

function getPreviousObjectDetailButton() {
  return cy.findByTestId("view-previous-object-detail");
}

function getNextObjectDetailButton() {
  return cy.findByTestId("view-next-object-detail");
}

function changeSorting(columnName, direction) {
  const icon = direction === "asc" ? "arrow_up" : "arrow_down";
  cy.findByText(columnName).click();
  popover().within(() => {
    cy.icon(icon).click();
  });
  cy.wait("@dataset");
}

["postgres", "mysql"].forEach(dialect => {
  describe(
    `Object Detail > composite keys (${dialect})`,
    { tags: ["@external"] },
    () => {
      const TEST_TABLE = "composite_pk_table";

      beforeEach(() => {
        resetTestTable({ type: dialect, table: TEST_TABLE });
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();
        resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      });

      it("can show object detail modal for items with composite keys", () => {
        getTableId({ name: TEST_TABLE }).then(tableId => {
          cy.visit(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`);
        });

        cy.icon("expand").first().click();

        cy.findByRole("dialog").within(() => {
          cy.findAllByText("Duck").should("have.length", 2);
          cy.icon("chevrondown").click();
          cy.findAllByText("Horse").should("have.length", 2);
        });
      });

      it("cannot navigate past the end of the list of objects with the keyboard", () => {
        // this bug only manifests on tables without single integer primary keys
        // it is also reproducible on tables with string keys

        getTableId({ name: TEST_TABLE }).then(tableId => {
          cy.visit(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`);
        });

        cy.get("#main-data-grid").findByText("Rabbit").trigger("mouseover");

        cy.icon("expand").first().click();

        cy.findByRole("dialog").within(() => {
          cy.findAllByText("Rabbit").should("have.length", 2);
        });

        cy.get("body").type("{downarrow}");

        cy.findByRole("dialog").within(() => {
          cy.findAllByText("Rabbit").should("have.length", 2);
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
        resetTestTable({ type: dialect, table: TEST_TABLE });
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();
        resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      });

      it("can show object detail modal for items with no primary key", () => {
        getTableId({ name: TEST_TABLE }).then(tableId => {
          cy.visit(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`);
        });

        cy.icon("expand").first().click();

        cy.findByRole("dialog").within(() => {
          cy.findAllByText("Duck").should("have.length", 2);
          cy.icon("chevrondown").click();
          cy.findAllByText("Horse").should("have.length", 2);
        });
      });
    },
  );
});

describe(`Object Detail > public`, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("can view a public object detail question", () => {
    cy.createQuestion({ ...TEST_QUESTION, display: "object" }).then(
      ({ body: { id: questionId } }) => {
        visitPublicQuestion(questionId);
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
    cy.createQuestionAndDashboard({
      questionDetails: { ...TEST_QUESTION, display: "object" },
    }).then(({ body: { dashboard_id } }) => {
      visitPublicDashboard(dashboard_id);
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
