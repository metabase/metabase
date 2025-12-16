const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { CardId, CardType, FieldId, TableId } from "metabase-types/api";

const { ORDERS_ID, ORDERS, REVIEWS } = SAMPLE_DATABASE;

const VALID_QUESTION_FIELD_ID_REF = "Valid question field id ref";
const VALID_QUESTION_FIELD_NAME_REF = "Valid question field name ref";
const VALID_NATIVE_CARD = "Valid native card";

const VALID_ENTITY_NAMES = [
  VALID_QUESTION_FIELD_ID_REF,
  VALID_QUESTION_FIELD_NAME_REF,
  VALID_NATIVE_CARD,
];

const BROKEN_QUESTION_FIELD_ID_REF = "Broken question field id ref";
const BROKEN_QUESTION_FIELD_NAME_REF = "Broken question field name ref";
const BROKEN_NATIVE_QUESTION_COLUMN = "Broken native question column";
const BROKEN_NATIVE_QUESTION_TABLE_ALIAS = "Broken native question table";
const BROKEN_NATIVE_QUESTION_SYNTAX = "Broken native question syntax";

const BROKEN_MODEL_FIELD_ID_REF = "Broken model field id ref";
const BROKEN_MODEL_FIELD_NAME_REF = "Broken model field name ref";
const BROKEN_MODEL_COLUMN = "Broken model column";
const BROKEN_MODEL_TABLE_ALIAS = "Broken model table alias";
const BROKEN_MODEL_SYNTAX = "Broken model syntax";

const BROKEN_METRIC_FIELD_ID_REF = "Broken metric field id ref";
const BROKEN_METRIC_FIELD_NAME_REF = "Broken metric field name ref";

const BROKEN_QUESTION_NAMES = [
  BROKEN_QUESTION_FIELD_ID_REF,
  BROKEN_QUESTION_FIELD_NAME_REF,
  BROKEN_NATIVE_QUESTION_COLUMN,
  BROKEN_NATIVE_QUESTION_TABLE_ALIAS,
  BROKEN_NATIVE_QUESTION_SYNTAX,
];

const BROKEN_MODEL_NAMES = [
  BROKEN_MODEL_FIELD_ID_REF,
  BROKEN_MODEL_FIELD_NAME_REF,
  BROKEN_MODEL_COLUMN,
  BROKEN_MODEL_TABLE_ALIAS,
  BROKEN_MODEL_SYNTAX,
];

const BROKEN_METRIC_NAMES = [
  BROKEN_METRIC_FIELD_ID_REF,
  BROKEN_METRIC_FIELD_NAME_REF,
];

const BROKEN_ENTITY_NAMES = [
  ...BROKEN_QUESTION_NAMES,
  ...BROKEN_MODEL_NAMES,
  ...BROKEN_METRIC_NAMES,
];

describe("scenarios > dependencies > broken list", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.viewport(1600, 1400);
  });

  describe("analysis", () => {
    it("should show broken entities", () => {
      createValidEntities;
      createBrokenEntities();
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_ENTITY_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
        VALID_ENTITY_NAMES.forEach((name) => {
          cy.findByText(name).should("not.exist");
        });
      });
    });
  });
});

function createValidEntities() {
  createCardWithFieldIdRef({
    name: VALID_QUESTION_FIELD_ID_REF,
    type: "question",
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
  });
  createCardWithFieldNameRef({
    name: VALID_QUESTION_FIELD_NAME_REF,
    type: "question",
    cardId: ORDERS_QUESTION_ID,
    fieldName: "TOTAL",
  });
  createNativeCard({
    name: VALID_NATIVE_CARD,
    type: "question",
    query: "SELECT ID, TOTAL FROM ORDERS",
  });
}

function createBrokenEntities() {
  createCardWithFieldIdRef({
    name: BROKEN_QUESTION_FIELD_ID_REF,
    type: "question",
    tableId: ORDERS_ID,
    fieldId: REVIEWS.RATING,
  });
  createCardWithFieldNameRef({
    name: BROKEN_QUESTION_FIELD_NAME_REF,
    type: "question",
    cardId: ORDERS_QUESTION_ID,
    fieldName: "BAD_NAME",
  });
  createNativeCard({
    name: BROKEN_NATIVE_QUESTION_COLUMN,
    type: "question",
    query: "SELECT ID, RATING FROM ORDERS",
  });
  createNativeCard({
    name: BROKEN_NATIVE_QUESTION_TABLE_ALIAS,
    type: "question",
    query: "SELECT P.ID, P.PRICE FROM ORDERS",
  });
  createNativeCard({
    name: BROKEN_NATIVE_QUESTION_SYNTAX,
    type: "question",
    query: "SELECT FROM",
  });

  createCardWithFieldIdRef({
    name: BROKEN_MODEL_FIELD_ID_REF,
    type: "model",
    tableId: ORDERS_ID,
    fieldId: REVIEWS.RATING,
  });
  createCardWithFieldNameRef({
    name: BROKEN_MODEL_FIELD_NAME_REF,
    type: "model",
    cardId: ORDERS_QUESTION_ID,
    fieldName: "BAD_NAME",
  });
  createNativeCard({
    name: BROKEN_MODEL_COLUMN,
    type: "model",
    query: "SELECT ID, RATING FROM ORDERS",
  });
  createNativeCard({
    name: BROKEN_MODEL_TABLE_ALIAS,
    type: "model",
    query: "SELECT P.ID, P.PRICE FROM ORDERS",
  });
  createNativeCard({
    name: BROKEN_MODEL_SYNTAX,
    type: "model",
    query: "SELECT FROM",
  });

  createCardWithFieldIdRef({
    name: BROKEN_METRIC_FIELD_ID_REF,
    type: "metric",
    tableId: ORDERS_ID,
    fieldId: REVIEWS.RATING,
  });
  createCardWithFieldNameRef({
    name: BROKEN_METRIC_FIELD_NAME_REF,
    type: "metric",
    cardId: ORDERS_QUESTION_ID,
    fieldName: "BAD_NAME",
  });
}

function createCardWithFieldIdRef({
  name,
  type,
  tableId,
  fieldId,
}: {
  name: string;
  type: CardType;
  tableId: TableId;
  fieldId: FieldId;
}) {
  return H.createQuestion({
    name,
    type,
    query: {
      "source-table": tableId,
      aggregation: [["sum", ["field", fieldId, null]]],
    },
  });
}

function createCardWithFieldNameRef({
  name,
  type,
  cardId,
  fieldName,
}: {
  name: string;
  type: CardType;
  cardId: CardId;
  fieldName: string;
}) {
  return H.createQuestion({
    name,
    type,
    query: {
      "source-table": `card__${cardId}`,
      aggregation: [
        ["sum", ["field", fieldName, { "base-type": "type/Integer" }]],
      ],
    },
  });
}

function createNativeCard({
  name,
  type,
  query,
}: {
  name: string;
  type: CardType;
  query: string;
}) {
  return H.createNativeQuestion({
    name,
    type,
    native: {
      query,
    },
  });
}
