const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  CardId,
  CardType,
  FieldId,
  NativeQuerySnippetId,
  SegmentId,
  TableId,
} from "metabase-types/api";

const { ORDERS_ID, ORDERS, REVIEWS_ID, REVIEWS } = SAMPLE_DATABASE;

const VALID_CARD_COLUMN_ID = "Valid card column with id";
const VALID_CARD_COLUMN_NAME = "Valid card column with name";
const VALID_NATIVE_CARD = "Valid native card";
const VALID_SEGMENT = "Valid segment";
const VALID_METRIC = "Valid metric";

const VALID_ENTITY_NAMES = [
  VALID_CARD_COLUMN_ID,
  VALID_CARD_COLUMN_NAME,
  VALID_NATIVE_CARD,
  VALID_SEGMENT,
  VALID_METRIC,
];

const CARD_COLUMN_ID_MISSING = "Card with a non-existing column with an id";
const CARD_COLUMN_WRONG_TABLE = "Card with a column on a wrong table";
const CARD_COLUMN_NAME_MISSING = "Card with a non-existing column with a name";
const CARD_SEGMENT_MISSING = "Card with a non-existing segment";
const CARD_SEGMENT_WRONG_TABLE = "Card with a segment on a wrong table";
const CARD_METRIC_MISSING = "Card with a non-existing metric";
const CARD_METRIC_WRONG_TABLE = "Card with a metric on a wrong table";
const NATIVE_CARD_COLUMN_MISSING = "Native card with a non-existing column";
const NATIVE_CARD_TABLE_ALIAS_MISSING =
  "Native card with a missing table alias";
const NATIVE_CARD_SYNTAX_ERROR = "Native card with a syntax error";
const NATIVE_CARD_CARD_TAG_MISSING = "Native card with a missing card tag";
const NATIVE_CARD_SNIPPET_TAG_MISSING =
  "Native card with a missing snippet tag";

const BROKEN_MBQL_CARD_NAMES = [
  CARD_COLUMN_ID_MISSING,
  CARD_COLUMN_WRONG_TABLE,
  CARD_COLUMN_NAME_MISSING,
  CARD_SEGMENT_MISSING,
  CARD_SEGMENT_WRONG_TABLE,
  CARD_METRIC_MISSING,
  CARD_METRIC_WRONG_TABLE,
];

const BROKEN_NATIVE_CARD_NAMES = [
  NATIVE_CARD_COLUMN_MISSING,
  NATIVE_CARD_TABLE_ALIAS_MISSING,
  NATIVE_CARD_SYNTAX_ERROR,
  NATIVE_CARD_CARD_TAG_MISSING,
  NATIVE_CARD_SNIPPET_TAG_MISSING,
];

const BROKEN_CARD_NAMES = [
  ...BROKEN_MBQL_CARD_NAMES,
  ...BROKEN_NATIVE_CARD_NAMES,
];

describe("scenarios > dependencies > broken list", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.viewport(1600, 1400);
  });

  describe("analysis", () => {
    it("should not show valid entities", () => {
      createCardContent({ type: "question" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        VALID_ENTITY_NAMES.forEach((name) => {
          cy.findByText(name).should("not.exist");
        });
      });
    });

    it("should show broken questions", () => {
      createCardContent({ type: "question" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_CARD_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });

    it("should show broken models", () => {
      createCardContent({ type: "model" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_CARD_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });

    it("should show broken metrics", () => {
      createCardContent({ type: "metric" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_MBQL_CARD_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });
  });
});

function createCardContent({ type }: { type: CardType }) {
  createCardWithFieldIdRef({
    name: VALID_CARD_COLUMN_ID,
    type,
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
  });
  createCardWithFieldNameRef({
    name: VALID_CARD_COLUMN_NAME,
    type,
    cardId: ORDERS_QUESTION_ID,
    fieldName: "TOTAL",
    baseType: "type/Float",
  });
  createNativeCard({
    name: VALID_NATIVE_CARD,
    type,
    query: "SELECT ID, TOTAL FROM ORDERS",
  });

  createSegmentWithFieldIdRef({
    name: VALID_SEGMENT,
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
  }).then(({ body: segment }) => {
    createCardWithFieldIdRef({
      name: VALID_METRIC,
      type: "metric",
      tableId: ORDERS_ID,
      fieldId: ORDERS.TOTAL,
    }).then(({ body: metric }) => {
      createCardWithFieldIdRef({
        name: CARD_COLUMN_WRONG_TABLE,
        type,
        tableId: ORDERS_ID,
        fieldId: REVIEWS.RATING,
      });
      createCardWithFieldIdRef({
        name: CARD_COLUMN_ID_MISSING,
        type,
        tableId: ORDERS_ID,
        fieldId: 1000,
      });
      createCardWithFieldNameRef({
        name: CARD_COLUMN_NAME_MISSING,
        type,
        cardId: ORDERS_QUESTION_ID,
        fieldName: "BAD_NAME",
        baseType: "type/Integer",
      });
      createCardWithSegmentClause({
        name: CARD_SEGMENT_WRONG_TABLE,
        type,
        tableId: REVIEWS_ID,
        segmentId: segment.id,
      });
      createCardWithSegmentClause({
        name: CARD_SEGMENT_MISSING,
        type,
        tableId: REVIEWS_ID,
        segmentId: 1000,
      });
      createCardWithMetricClause({
        name: CARD_METRIC_WRONG_TABLE,
        type,
        tableId: REVIEWS_ID,
        metricId: metric.id,
      });
      createCardWithMetricClause({
        name: CARD_METRIC_MISSING,
        type,
        tableId: REVIEWS_ID,
        metricId: metric.id,
      });
    });
  });

  if (type !== "metric") {
    createNativeCard({
      name: NATIVE_CARD_COLUMN_MISSING,
      type,
      query: "SELECT ID, RATING FROM ORDERS",
    });
    createNativeCard({
      name: NATIVE_CARD_TABLE_ALIAS_MISSING,
      type,
      query: "SELECT P.ID, P.PRICE FROM ORDERS",
    });
    createNativeCard({
      name: NATIVE_CARD_SYNTAX_ERROR,
      type,
      query: "SELECT FROM",
    });
    createNativeCardWithCardTag({
      name: NATIVE_CARD_CARD_TAG_MISSING,
      type,
      cardId: 1000,
    });
    createNativeCardWithSnippetTag({
      name: NATIVE_CARD_SNIPPET_TAG_MISSING,
      type,
      snippetId: 1000,
      snippetName: "missing-snippet",
    });
  }
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

function createCardWithMetricClause({
  name,
  type,
  tableId,
  metricId,
}: {
  name: string;
  type: CardType;
  tableId: TableId;
  metricId: CardId;
}) {
  return H.createQuestion({
    name,
    type,
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
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

function createNativeCardWithCardTag({
  name,
  type,
  cardId,
}: {
  name: string;
  type: CardType;
  cardId: CardId;
}) {
  const tagName = `#${cardId}`;

  return H.createNativeQuestion({
    name,
    type,
    native: {
      query: `SELECT * {{${tagName}}}`,
      "template-tags": {
        [tagName]: {
          id: tagName,
          name: tagName,
          "display-name": tagName,
          type: "card",
          "card-id": cardId,
        },
      },
    },
  });
}

function createNativeCardWithSnippetTag({
  name,
  type,
  snippetId,
  snippetName,
}: {
  name: string;
  type: CardType;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  const tagName = `snippet: ${snippetName}`;

  return H.createNativeQuestion({
    name,
    type,
    native: {
      query: `SELECT * FROM ORDERS WHERE {{${tagName}}}`,
      "template-tags": {
        [tagName]: {
          id: tagName,
          name: tagName,
          "display-name": tagName,
          type: "snippet",
          "snippet-id": snippetId,
          "snippet-name": snippetName,
        },
      },
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
