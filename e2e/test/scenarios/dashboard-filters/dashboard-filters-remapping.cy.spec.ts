const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
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
    testDashboardWidgets();
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
  const nativeQuestionDetails: NativeQuestionDetails = {
    native: {
      query: "SELECT * FROM ORDERS WHERE {{product_id}}",
      "template-tags": {
        product_id: {
          id: "product_id",
          name: "Product ID",
          "display-name": "Product ID",
          type: "dimension",
          dimension: ["field", ORDERS.PRODUCT_ID, null],
        },
      },
    },
  };
  const getMbqlQuestionDetails = (
    modelId: CardId,
  ): StructuredQuestionDetails => ({
    name: "Question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
  H.createQuestion(modelDetails).then(({ body: card }) => {
    H.createDashboardWithQuestions({
      questions: [
        nativeQuestionDetails,
        getMbqlQuestionDetails(card.id),
        getMbqlQuestionDetails(card.id),
      ],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
    });
  });

  H.editDashboard();

  H.setFilter("Number", undefined, "Internal");
  H.selectDashboardFilter(H.getDashboardCard(1), "Quantity");

  H.setFilter("ID", undefined, "External");
  H.selectDashboardFilter(H.getDashboardCard(0), "Product ID");

  H.setFilter("ID", undefined, "PK->Name");
  H.getDashboardCard(1).findByText("Select…").click();
  H.popover().findAllByText("ID").should("have.length", 3).last().click();

  H.setFilter("ID", undefined, "FK->Name");
  H.selectDashboardFilter(H.getDashboardCard(1), "User ID");

  H.setFilter("ID", undefined, "PK+FK pair->Name");
  H.selectDashboardFilter(H.getDashboardCard(1), "User ID");
  H.getDashboardCard(2).findByText("Select…").click({ force: true });
  H.popover().findAllByText("ID").should("have.length", 3).last().click();

  H.saveDashboard();
}

function findWidget(name: string) {
  return H.filterWidget().filter(`:contains("${name}")`);
}

function testDashboardWidgets() {
  cy.log("internal remapping");
  findWidget("Internal").click();
  H.popover().within(() => {
    cy.findByText("N5").click();
    cy.button("Add filter").click();
  });
  findWidget("Internal").should("contain.text", "N5");

  cy.log("external remapping");
  findWidget("External").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Rustic Paper Wallet").should("exist");
    cy.button("Add filter").click();
  });
  findWidget("External").should("contain.text", "Rustic Paper Wallet");

  cy.log("PK->Name remapping");
  findWidget("PK->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Hudson Borer").should("exist");
    cy.button("Add filter").click();
  });
  findWidget("PK->Name").should("contain.text", "Hudson Borer");

  cy.log("FK->Name remapping");
  findWidget("FK->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("2,");
    cy.findByText("Domenica Williamson").should("exist");
    cy.button("Add filter").click();
  });
  findWidget("FK->Name").should("contain.text", "Domenica Williamson");

  cy.log("PK+FK->Name remapping");
  findWidget("PK+FK pair->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("2,");
    cy.findByText("Domenica Williamson").should("exist");
    cy.button("Add filter").click();
  });
  findWidget("PK+FK pair").should("contain.text", "Domenica Williamson");
}
