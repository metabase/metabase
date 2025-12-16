const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { CardId, CardType, FieldId, TableId } from "metabase-types/api";

const { ORDERS_ID, ORDERS, REVIEWS } = SAMPLE_DATABASE;

const VALID_QUESTION_FIELD_ID_REF = "Valid question field id ref";
const VALID_QUESTION_FIELD_NAME_REF = "Valid question field name ref";

const VALID_ENTITY_NAMES = [
  VALID_QUESTION_FIELD_ID_REF,
  VALID_QUESTION_FIELD_NAME_REF,
];

const BROKEN_QUESTION_FIELD_ID_REF = "Broken question field id ref";
const BROKEN_QUESTION_FIELD_NAME_REF = "Broken question field name ref";

const BROKEN_ENTITY_NAMES = [
  BROKEN_QUESTION_FIELD_ID_REF,
  BROKEN_QUESTION_FIELD_NAME_REF,
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
    name: "Valid question field id ref",
    type: "question",
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
  });
  createCardWithFieldNameRef({
    name: "Valid question field name ref",
    type: "question",
    cardId: ORDERS_QUESTION_ID,
    fieldName: "TOTAL",
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
