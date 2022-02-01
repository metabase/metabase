import { restore, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > object details", () => {
  const FIRST_ORDER_ID = 9676;
  const SECOND_ORDER_ID = 10874;
  const THIRD_ORDER_ID = 11246;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          filter: [
            "and",
            [">", ["field", ORDERS.TOTAL, null], 149],
            [">", ["field", ORDERS.TAX, null], 10],
            ["not-null", ["field", ORDERS.DISCOUNT, null]],
          ],
        },
      },
      { visitQuestion: true },
    );
  });

  it("handles browsing records by PKs", () => {
    getFirstTableColumn()
      .eq(1)
      .should("contain", FIRST_ORDER_ID)
      .click();

    assertOrderDetailView({ id: FIRST_ORDER_ID });
    getPreviousObjectDetailButton().should(
      "have.attr",
      "aria-disabled",
      "true",
    );

    getNextObjectDetailButton().click();
    assertOrderDetailView({ id: SECOND_ORDER_ID });

    getNextObjectDetailButton().click();
    assertOrderDetailView({ id: THIRD_ORDER_ID });
    getNextObjectDetailButton().should("have.attr", "aria-disabled", "true");

    getPreviousObjectDetailButton().click();
    assertOrderDetailView({ id: SECOND_ORDER_ID });

    getPreviousObjectDetailButton().click();
    assertOrderDetailView({ id: FIRST_ORDER_ID });
  });

  it("handles browsing records by FKs", () => {
    const FIRST_USER_ID = 1283;

    cy.findByText(String(FIRST_USER_ID)).click();
    popover()
      .findByText("View details")
      .click();

    assertUserDetailView({ id: FIRST_USER_ID });
    getPreviousObjectDetailButton().click();
    assertUserDetailView({ id: FIRST_USER_ID - 1 });
    getNextObjectDetailButton().click();
    getNextObjectDetailButton().click();
    assertUserDetailView({ id: FIRST_USER_ID + 1 });
  });
});

function getFirstTableColumn() {
  return cy.get(".TableInteractive-cellWrapper--firstColumn");
}

function assertDetailView({ id, entityName, byFK = false }) {
  cy.get("h1")
    .parent()
    .should("contain", entityName)
    .should("contain", id);

  const pattern = byFK
    ? new RegExp(`/question\\?objectId=${id}#*`)
    : new RegExp(`/question/[1-9]\d*.*/${id}`);

  cy.url().should("match", pattern);
}

function assertOrderDetailView({ id }) {
  assertDetailView({ id, entityName: "Order" });
}

function assertUserDetailView({ id }) {
  assertDetailView({ id, entityName: "Person", byFK: true });
}

function getPreviousObjectDetailButton() {
  return cy.findByTestId("view-previous-object-detail");
}

function getNextObjectDetailButton() {
  return cy.findByTestId("view-next-object-detail");
}
