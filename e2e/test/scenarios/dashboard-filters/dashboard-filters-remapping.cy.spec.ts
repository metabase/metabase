const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  DashboardDetails,
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { CardId, GetFieldValuesResponse } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > remapping", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    addInternalRemapping();
    addExternalRemapping();
  });

  it("should remap dashboard parameter values", () => {
    createDashboard().then((dashboardId) => {
      H.visitDashboard(dashboardId);
      H.editDashboard();
      mapParameters();
      H.saveDashboard();

      testDefaultValuesRemapping();
      testWidgetsRemapping();

      H.visitPublicDashboard(dashboardId);
      testDefaultValuesRemapping();
      testWidgetsRemapping();

      H.visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      });
      testDefaultValuesRemapping();
      testWidgetsRemapping();
    });
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

function findWidget(name: string) {
  return H.dashboardParametersContainer().findByLabelText(name);
}

function clearWidget(name: string) {
  findWidget(name).icon("close").click();
}

function createDashboard() {
  const ordersModelDetails: StructuredQuestionDetails = {
    name: "Orders model",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
    },
  };
  const getOrdersQuestionDetails = (
    modelId: CardId,
  ): StructuredQuestionDetails => ({
    name: "Orders question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
  const peopleModelDetails: StructuredQuestionDetails = {
    name: "People model",
    type: "model",
    query: {
      "source-table": PEOPLE_ID,
    },
  };
  const getPeopleQuestionDetails = (
    modelId: CardId,
  ): StructuredQuestionDetails => ({
    name: "People question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
  const nativeQuestionDetails: NativeQuestionDetails = {
    name: "Orders native question",
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
  const dashboardDetails: DashboardDetails = {
    parameters: [
      createMockParameter({
        id: "p1",
        slug: "p1",
        name: "Internal",
        type: "number/=",
        default: [1],
      }),
      createMockParameter({
        id: "p2",
        slug: "p2",
        name: "FK",
        type: "id",
        default: [2],
      }),
      createMockParameter({
        id: "p3",
        slug: "p3",
        name: "PK->Name",
        type: "id",
        default: [3],
      }),
      createMockParameter({
        id: "p4",
        slug: "p4",
        name: "FK->Name",
        type: "id",
        default: [4],
      }),
      createMockParameter({
        id: "p5",
        slug: "p5",
        name: "PK+FK->Name",
        type: "id",
        default: [5],
      }),
    ],
    enable_embedding: true,
    embedding_params: {
      p1: "enabled",
      p2: "enabled",
      p3: "enabled",
      p4: "enabled",
      p5: "enabled",
    },
  };
  return H.createQuestion(ordersModelDetails).then(({ body: ordersModel }) => {
    return H.createQuestion(peopleModelDetails).then(
      ({ body: peopleModel }) => {
        return H.createDashboardWithQuestions({
          dashboardDetails,
          questions: [
            getOrdersQuestionDetails(ordersModel.id),
            getPeopleQuestionDetails(peopleModel.id),
            nativeQuestionDetails,
          ],
        }).then(({ dashboard }) => {
          return Number(dashboard.id);
        });
      },
    );
  });
}

function mapParameters() {
  H.editingDashboardParametersContainer().findByText("Internal").click();
  H.selectDashboardFilter(H.getDashboardCard(0), "Quantity");

  H.editingDashboardParametersContainer().findByText("FK").click();
  H.selectDashboardFilter(H.getDashboardCard(2), "Product ID");

  H.editingDashboardParametersContainer().findByText("PK->Name").click();
  H.selectDashboardFilter(H.getDashboardCard(1), "ID");

  H.editingDashboardParametersContainer().findByText("FK->Name").click();
  H.selectDashboardFilter(H.getDashboardCard(0), "User ID");

  H.editingDashboardParametersContainer().findByText("PK+FK->Name").click();
  H.selectDashboardFilter(H.getDashboardCard(0), "User ID");
  H.selectDashboardFilter(H.getDashboardCard(1), "ID");
}

function testDefaultValuesRemapping() {
  findWidget("Internal").should("contain.text", "N1");
  findWidget("FK").should("contain.text", "Small Marble Shoes");
  findWidget("PK->Name").should("contain.text", "Lina Heaney");
  findWidget("FK->Name").should("contain.text", "Arnold Adams");
  findWidget("PK+FK->Name").should("contain.text", "Dominique Leffler");
}

function testWidgetsRemapping() {
  cy.log("internal remapping");
  clearWidget("Internal");
  findWidget("Internal").click();
  H.popover().within(() => {
    cy.findByText("N5").click();
    cy.button("Update filter").click();
  });
  findWidget("Internal").should("contain.text", "N5");

  cy.log("FK remapping");
  clearWidget("FK");
  findWidget("FK").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Rustic Paper Wallet").should("exist");
    cy.button("Update filter").click();
  });
  findWidget("FK").should("contain.text", "Rustic Paper Wallet");

  cy.log("PK->Name remapping");
  clearWidget("PK->Name");
  findWidget("PK->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Hudson Borer").should("exist");
    cy.button("Update filter").click();
  });
  findWidget("PK->Name").should("contain.text", "Hudson Borer");

  cy.log("FK->Name remapping");
  clearWidget("FK->Name");
  findWidget("FK->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("6,");
    cy.findByText("Rene Muller").should("exist");
    cy.button("Update filter").click();
  });
  findWidget("FK->Name").should("contain.text", "Rene Muller");

  cy.log("PK+FK->Name remapping");
  clearWidget("PK+FK->Name");
  findWidget("PK+FK->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("7,");
    cy.findByText("Roselyn Bosco").should("exist");
    cy.button("Update filter").click();
  });
  findWidget("PK+FK->Name").should("contain.text", "Roselyn Bosco");
}
