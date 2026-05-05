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
      testWidgetsRemapping();

      H.visitPublicQuestion(questionId);
      testWidgetsRemapping();

      H.visitEmbeddedPage({
        resource: { question: questionId },
        params: {},
      });
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

function createQuestion() {
  const questionDetails: NativeQuestionDetails = {
    name: "Orders native question",
    native: {
      query:
        "SELECT * " +
        "FROM ORDERS " +
        "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
        "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
      "template-tags": {
        quantity: {
          id: "quantity",
          name: "quantity",
          "display-name": "Internal",
          type: "dimension",
          "widget-type": "number/=",
          dimension: ["field", ORDERS.QUANTITY, null],
        },
        product_id_fk: {
          id: "product_id_fk",
          name: "product_id_fk",
          "display-name": "FK",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", ORDERS.PRODUCT_ID, null],
        },
        user_id_pk: {
          id: "user_id_pk",
          name: "user_id_pk",
          "display-name": "PK->Name",
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
      }),
      createMockParameter({
        id: "product_id_fk",
        name: "FK",
        slug: "product_id_fk",
        type: "id",
        target: ["dimension", ["template-tag", "product_id_fk"]],
      }),
      createMockParameter({
        id: "user_id_pk",
        name: "PK->Name",
        slug: "user_id_pk",
        type: "id",
        target: ["dimension", ["template-tag", "user_id_pk"]],
      }),
    ],
    enable_embedding: true,
    embedding_params: {
      quantity: "enabled",
      product_id_fk: "enabled",
      user_id_pk: "enabled",
    },
  };

  return H.createNativeQuestion(questionDetails).then(({ body }) => body.id);
}

function testWidgetsRemapping() {
  cy.log("internal remapping");
  H.filterWidget({ name: "Internal" }).click();
  H.popover().within(() => {
    cy.findByText("N5").click();
    cy.button("Add filter").click();
  });
  H.filterWidget({ name: "Internal" }).should("contain.text", "N5");

  cy.log("FK remapping");
  H.filterWidget({ name: "FK" }).click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Rustic Paper Wallet").should("exist");
    cy.button("Add filter").click();
  });
  H.filterWidget({ name: "FK" }).should("contain.text", "Rustic Paper Wallet");

  cy.log("PK->Name remapping");
  H.filterWidget({ name: "PK->Name" }).click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Hudson Borer").should("exist");
    cy.button("Add filter").click();
  });
  H.filterWidget({ name: "PK->Name" }).should("contain.text", "Hudson Borer");
}
