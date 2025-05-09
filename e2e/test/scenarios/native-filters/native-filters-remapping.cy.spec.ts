const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { NativeQuestionDetails } from "e2e/support/helpers";
import type { GetFieldValuesResponse } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, PRODUCTS, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > native > filters > remapping", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    addInternalRemapping();
    addExternalRemapping();
  });

  it("should remap dashboard parameter values", () => {
    createQuestion().then((questionId) => {
      H.visitQuestion(questionId);
      testDefaultValuesRemapping();

      H.visitPublicQuestion(questionId);
      testDefaultValuesRemapping();

      H.visitEmbeddedPage({
        resource: { question: questionId },
        params: {},
      });
      testDefaultValuesRemapping();
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
  return cy
    .findByTestId("native-query-top-bar")
    .findByText(name)
    .parents("fieldset");
}

function createQuestion() {
  const questionDetails: NativeQuestionDetails = {
    name: "Orders native question",
    native: {
      query:
        "SELECT * " +
        "FROM ORDERS " +
        "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
        "WHERE {{quantity}} AND {{user_id_pk}}",
      "template-tags": {
        quantity: {
          id: "quantity",
          name: "quantity",
          "display-name": "Internal",
          type: "dimension",
          "widget-type": "number/=",
          dimension: ["field", ORDERS.QUANTITY, null],
        },
        user_id_pk: {
          id: "user_id_pk",
          name: "user_id_pk",
          "display-name": "User ID PK",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", PEOPLE.ID, null],
        },
      },
    },
    parameters: [
      createMockParameter({
        id: "quantity",
        name: "Internal",
        slug: "quantity",
        type: "number/=",
        target: ["dimension", ["template-tag", "quantity"]],
        default: [1],
      }),
      createMockParameter({
        id: "user_id_pk",
        name: "PK->Name",
        slug: "user_id_pk",
        type: "id",
        target: ["dimension", ["template-tag", "user_id_pk"]],
        default: [3],
      }),
    ],
    enable_embedding: true,
    embedding_params: {
      quantity: "enabled",
      user_id_pk: "enabled",
    },
  };

  return H.createNativeQuestion(questionDetails).then(({ body }) => body.id);
}

function testDefaultValuesRemapping() {
  findWidget("Internal").should("contain.text", "N1");
  findWidget("PK->Name").should("contain.text", "Lina Heaney");
}
