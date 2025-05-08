const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { CardId, GetFieldValuesResponse } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > remapping", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    addInternalRemapping();
    addExternalRemapping();
  });

  it("should work in dashboards", () => {
    setupDashboard();
    testDashboardFilterWidgets();
  });
});

function addInternalRemapping() {
  cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
    name: "Quantity",
    type: "internal",
    human_readable_field_id: null,
  });

  cy.request("GET", `/api/field/${ORDERS.QUANTITY}/values`).then(
    ({ body }: { body: GetFieldValuesResponse }) => {
      cy.request("POST", `/api/field/${ORDERS.QUANTITY}/values`, {
        values: body.values.map(([value]) => [value, `N${value}`]),
      });
    },
  );
}

function addExternalRemapping() {
  cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
}

function setupDashboard() {
  const modelDetails: StructuredQuestionDetails = {
    query: {
      "source-table": ORDERS_ID,
    },
  };
  const getQuestionDetails = (modelId: CardId): StructuredQuestionDetails => ({
    name: "Question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
  H.createQuestion(modelDetails).then(({ body: card }) => {
    H.createQuestionAndDashboard({
      questionDetails: getQuestionDetails(card.id),
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
    });
  });

  H.editDashboard();
  H.setFilter("Number", undefined, "Quantity");
  H.selectDashboardFilter(H.getDashboardCard(), "Quantity");
  H.setFilter("ID", undefined, "User ID PK");
  H.getDashboardCard().findByText("Select…").click();
  H.popover().findAllByText("ID").should("have.length", 3).last().click();
  H.setFilter("ID", undefined, "User ID FK");
  H.selectDashboardFilter(H.getDashboardCard(), "User ID");
  H.saveDashboard();
}

const RATING_INDEX = 0;
const USER_ID_PK_INDEX = 1;
const USER_ID_FK_INDEX = 2;
const WIDGET_COUNT = 3;

function findWidget(index: number) {
  return H.filterWidget().should("have.length", WIDGET_COUNT).eq(index);
}

function testDashboardFilterWidgets() {
  cy.log("internal remapping");
  findWidget(RATING_INDEX).click();
  H.popover().within(() => {
    cy.findByText("N5").click();
    cy.button("Add filter").click();
  });
  findWidget(RATING_INDEX).should("contain.text", "N5");

  cy.log("PK->Name remapping");
  findWidget(USER_ID_PK_INDEX).click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Hudson Borer").should("exist");
    cy.button("Add filter").click();
  });
  findWidget(USER_ID_PK_INDEX).should("contain.text", "Hudson Borer");

  cy.log("FK->PK->Name remapping");
  findWidget(USER_ID_FK_INDEX).click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("2,");
    cy.findByText("Domenica Williamson").should("exist");
    cy.button("Add filter").click();
  });
  findWidget(USER_ID_FK_INDEX).should("contain.text", "Domenica Williamson");
}
