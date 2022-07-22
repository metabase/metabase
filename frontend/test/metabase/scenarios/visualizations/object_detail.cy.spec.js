import {
  restore,
  popover,
  openOrdersTable,
  openPeopleTable,
  openProductsTable,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > question > object details", () => {
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

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
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
      cy.findByText("The page you asked for couldn't be found.");
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
    cy.findByText(`Showing ${EXPECTED_LINKED_ORDERS_COUNT} rows`);
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

    cy.findByTextEnsureVisible("Rustic Paper Wallet").click();

    cy.location("search").should("eq", "?objectId=Rustic%20Paper%20Wallet");
    cy.findByTestId("object-detail").contains("Rustic Paper Wallet");
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
