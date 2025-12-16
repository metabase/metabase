const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  CardId,
  CardType,
  FieldId,
  SegmentId,
  TableId,
} from "metabase-types/api";

const { ORDERS_ID, ORDERS, REVIEWS_ID, REVIEWS } = SAMPLE_DATABASE;

const VALID_QUESTION_COLUMN_ID = "Valid question column with id";
const VALID_QUESTION_COLUMN_NAME = "Valid question column with name";
const VALID_NATIVE_QUESTION = "Valid native question";
const VALID_SEGMENT = "Valid segment";

const VALID_ENTITY_NAMES = [
  VALID_QUESTION_COLUMN_ID,
  VALID_QUESTION_COLUMN_NAME,
  VALID_NATIVE_QUESTION,
  VALID_SEGMENT,
];

const QUESTION_COLUMN_ID_MISSING =
  "Question with a non-existing column with an id";
const QUESTION_COLUMN_WRONG_TABLE = "Question with a column on a wrong table";
const QUESTION_COLUMN_NAME_MISSING =
  "Question with a non-existing column with a name";
const QUESTION_SEGMENT_MISSING = "Question with a non-existing segment";
const QUESTION_SEGMENT_WRONG_TABLE = "Question with a segment on a wrong table";
const NATIVE_QUESTION_COLUMN_MISSING =
  "Native question with a non-existing column";
const NATIVE_QUESTION_TABLE_ALIAS_MISSING =
  "Native question with a missing table alias";
const NATIVE_QUESTION_SYNTAX_ERROR = "Native question with a syntax error";

const BROKEN_QUESTION_NAMES = [
  QUESTION_COLUMN_ID_MISSING,
  QUESTION_COLUMN_WRONG_TABLE,
  QUESTION_COLUMN_NAME_MISSING,
  QUESTION_SEGMENT_MISSING,
  QUESTION_SEGMENT_WRONG_TABLE,
  NATIVE_QUESTION_COLUMN_MISSING,
  NATIVE_QUESTION_TABLE_ALIAS_MISSING,
  NATIVE_QUESTION_SYNTAX_ERROR,
];

const BROKEN_ENTITY_NAMES = [...BROKEN_QUESTION_NAMES];

describe("scenarios > dependencies > broken list", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.viewport(1600, 1400);
  });

  describe("analysis", () => {
    it("should show broken entities", () => {
      createEntities();
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

function createEntities() {
  createCardWithFieldIdRef({
    name: VALID_QUESTION_COLUMN_ID,
    type: "question",
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
  });
  createCardWithFieldNameRef({
    name: VALID_QUESTION_COLUMN_NAME,
    type: "question",
    cardId: ORDERS_QUESTION_ID,
    fieldName: "TOTAL",
    baseType: "type/Float",
  });
  createNativeCard({
    name: VALID_NATIVE_QUESTION,
    type: "question",
    query: "SELECT ID, TOTAL FROM ORDERS",
  });

  createSegmentWithFieldIdRef({
    name: VALID_SEGMENT,
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
  }).then(({ body: segment }) => {
    createCardWithFieldIdRef({
      name: QUESTION_COLUMN_WRONG_TABLE,
      type: "question",
      tableId: ORDERS_ID,
      fieldId: REVIEWS.RATING,
    });
    createCardWithFieldIdRef({
      name: QUESTION_COLUMN_ID_MISSING,
      type: "question",
      tableId: ORDERS_ID,
      fieldId: 1000,
    });
    createCardWithFieldNameRef({
      name: QUESTION_COLUMN_NAME_MISSING,
      type: "question",
      cardId: ORDERS_QUESTION_ID,
      fieldName: "BAD_NAME",
      baseType: "type/Integer",
    });
    createCardWithSegmentClause({
      name: QUESTION_SEGMENT_WRONG_TABLE,
      type: "question",
      tableId: REVIEWS_ID,
      segmentId: segment.id,
    });
    createCardWithSegmentClause({
      name: QUESTION_SEGMENT_MISSING,
      type: "question",
      tableId: REVIEWS_ID,
      segmentId: 1000,
    });
    createNativeCard({
      name: NATIVE_QUESTION_COLUMN_MISSING,
      type: "question",
      query: "SELECT ID, RATING FROM ORDERS",
    });
    createNativeCard({
      name: NATIVE_QUESTION_TABLE_ALIAS_MISSING,
      type: "question",
      query: "SELECT P.ID, P.PRICE FROM ORDERS",
    });
    createNativeCard({
      name: NATIVE_QUESTION_SYNTAX_ERROR,
      type: "question",
      query: "SELECT FROM",
    });
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
      filter: ["not-null", ["field", fieldId, null]],
      aggregation: [["count"]],
    },
  });
}

function createCardWithFieldNameRef({
  name,
  type,
  cardId,
  fieldName,
  baseType,
}: {
  name: string;
  type: CardType;
  cardId: CardId;
  fieldName: string;
  baseType: string;
}) {
  return H.createQuestion({
    name,
    type,
    query: {
      "source-table": `card__${cardId}`,
      filter: ["not-null", ["field", fieldName, { "base-type": baseType }]],
      aggregation: [["count"]],
    },
  });
}

function createCardWithSegmentClause({
  name,
  type,
  tableId,
  segmentId,
}: {
  name: string;
  type: CardType;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createQuestion({
    name,
    type,
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
      aggregation: [["count"]],
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

function createSegmentWithFieldIdRef({
  name,
  tableId,
  fieldId,
}: {
  name: string;
  tableId: TableId;
  fieldId: FieldId;
}) {
  return H.createSegment({
    name,
    table_id: tableId,
    definition: {
      "source-table": tableId,
      filter: ["not-null", ["field", fieldId, null]],
    },
  });
}
