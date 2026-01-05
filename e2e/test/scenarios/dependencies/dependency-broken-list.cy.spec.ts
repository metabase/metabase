const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { CardId, CardType, FieldId, TableId } from "metabase-types/api";

const { ORDERS_ID, ORDERS, REVIEWS } = SAMPLE_DATABASE;

const WRITABLE_TABLE_NAME = "scoreboard_actions";

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
const NATIVE_CARD_COLUMN_MISSING = "Native card with a non-existing column";
const NATIVE_CARD_TABLE_ALIAS_MISSING =
  "Native card with a missing table alias";
const NATIVE_CARD_SYNTAX_ERROR = "Native card with a syntax error";

const BROKEN_MBQL_CARD_NAMES = [
  CARD_COLUMN_ID_MISSING,
  CARD_COLUMN_WRONG_TABLE,
  CARD_COLUMN_NAME_MISSING,
];

const BROKEN_MBQL_CARD_ERRORS = {
  [CARD_COLUMN_ID_MISSING]: { "1 missing column": ["Unknown Field"] },
  [CARD_COLUMN_WRONG_TABLE]: { "1 missing column": ["RATING"] },
  [CARD_COLUMN_NAME_MISSING]: { "1 missing column": ["BAD_NAME"] },
};

const BROKEN_NATIVE_CARD_NAMES = [
  NATIVE_CARD_COLUMN_MISSING,
  NATIVE_CARD_TABLE_ALIAS_MISSING,
  NATIVE_CARD_SYNTAX_ERROR,
];

const BROKEN_NATIVE_CARD_ERRORS = {
  [NATIVE_CARD_COLUMN_MISSING]: { "1 missing column": ["RATING"] },
  [NATIVE_CARD_TABLE_ALIAS_MISSING]: { "1 missing table alias": ["P"] },
  [NATIVE_CARD_SYNTAX_ERROR]: { "1 syntax error": [] },
};

const BROKEN_CARD_NAMES = [
  ...BROKEN_MBQL_CARD_NAMES,
  ...BROKEN_NATIVE_CARD_NAMES,
];

const BROKEN_CARD_ERRORS = {
  ...BROKEN_MBQL_CARD_ERRORS,
  ...BROKEN_NATIVE_CARD_ERRORS,
};

const SEGMENT_COLUMN_ID_MISSING =
  "Segment with a non-existing column with an id";
const BROKEN_SEGMENT_NAMES = [SEGMENT_COLUMN_ID_MISSING];

const TRANSFORM_COLUMN_ID_MISSING =
  "Transform with a non-existing column with an id";
const TRANSFORM_COLUMN_WRONG_TABLE = "Transform with a column on a wrong table";
const TRANSFORM_CARD_COLUMN_MISSING =
  "Native transform with a non-existing column";
const TRANSFORM_CARD_TABLE_ALIAS_MISSING =
  "Native transform with a missing table alias";
const TRANSFORM_CARD_SYNTAX_ERROR = "Native transform with a syntax error";

const BROKEN_TRANSFORM_NAMES = [
  TRANSFORM_COLUMN_ID_MISSING,
  TRANSFORM_COLUMN_WRONG_TABLE,
  TRANSFORM_CARD_COLUMN_MISSING,
  TRANSFORM_CARD_TABLE_ALIAS_MISSING,
  TRANSFORM_CARD_SYNTAX_ERROR,
];

const BROKEN_TRANSFORM_ERRORS = {
  [TRANSFORM_COLUMN_ID_MISSING]: { "1 missing column": ["Unknown Field"] },
  [TRANSFORM_COLUMN_WRONG_TABLE]: { "1 missing column": ["Unknown Field"] },
  [TRANSFORM_CARD_COLUMN_MISSING]: { "1 missing column": ["rating"] },
  [TRANSFORM_CARD_TABLE_ALIAS_MISSING]: { "1 missing table alias": ["P"] },
  [TRANSFORM_CARD_SYNTAX_ERROR]: { "1 syntax error": [] },
};

describe("scenarios > dependencies > broken list", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resetTestTable({ type: "postgres", table: WRITABLE_TABLE_NAME });
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: WRITABLE_TABLE_NAME });
    cy.viewport(1600, 1400);
  });

  describe("analysis", () => {
    it("should not show valid entities", () => {
      createValidEntities();
      createBrokenCards({ type: "question" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        VALID_ENTITY_NAMES.forEach((name) => {
          cy.findByText(name).should("not.exist");
        });
      });
    });

    it("should show broken questions", () => {
      createBrokenCards({ type: "question" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_CARD_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });

    it("should show broken models", () => {
      createBrokenCards({ type: "model" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_CARD_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });

    it("should show broken metrics", () => {
      createBrokenCards({ type: "metric" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_MBQL_CARD_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });

    it("should show broken segments", () => {
      createBrokenSegments();
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_SEGMENT_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });

    it("should show broken transforms", () => {
      createBrokenTransforms();
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.list().within(() => {
        BROKEN_TRANSFORM_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });
  });

  describe("search", () => {
    it("should search for entities", () => {
      createBrokenCards({ type: "question" });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.searchInput().type(CARD_COLUMN_ID_MISSING);
      checkList({
        visibleEntities: [CARD_COLUMN_ID_MISSING],
        hiddenEntities: [CARD_COLUMN_WRONG_TABLE],
      });
    });
  });

  describe("filters", () => {
    it("should filter entities by type", () => {
      createBrokenCards({ type: "question" });
      createBrokenSegments();
      createBrokenTransforms();
      H.DataStudio.Tasks.visitBrokenEntities();
      checkList({
        visibleEntities: [...BROKEN_CARD_NAMES, ...BROKEN_TRANSFORM_NAMES],
      });

      H.DataStudio.Tasks.filterButton().click();
      H.popover().findByText("Question").click();
      checkList({
        visibleEntities: [...BROKEN_CARD_NAMES],
        hiddenEntities: [...BROKEN_TRANSFORM_NAMES],
      });
    });
  });

  describe("sidebar", () => {
    it("should show the sidebar for questions with error info", () => {
      createBrokenCards({ type: "question" });
      H.DataStudio.Tasks.visitBrokenEntities();
      openSidebarAndCheckErrors(BROKEN_CARD_ERRORS);
    });

    it("should show the sidebar for models with error info", () => {
      createBrokenCards({ type: "model" });
      H.DataStudio.Tasks.visitBrokenEntities();
      openSidebarAndCheckErrors(BROKEN_CARD_ERRORS);
    });

    it("should show the sidebar for metrics with error info", () => {
      createBrokenCards({ type: "metric" });
      H.DataStudio.Tasks.visitBrokenEntities();
      openSidebarAndCheckErrors(BROKEN_MBQL_CARD_ERRORS);
    });

    it("should show the sidebar for transforms with error info", () => {
      createBrokenTransforms();
      H.DataStudio.Tasks.visitBrokenEntities();
      openSidebarAndCheckErrors(BROKEN_TRANSFORM_ERRORS);
    });
  });
});

function createValidEntities() {
  createCardWithFieldIdRef({
    name: VALID_CARD_COLUMN_ID,
    type: "question",
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
  });
  createCardWithFieldNameRef({
    name: VALID_CARD_COLUMN_NAME,
    type: "model",
    cardId: ORDERS_QUESTION_ID,
    fieldName: "TOTAL",
    baseType: "type/Float",
  });
  createNativeCard({
    name: VALID_NATIVE_CARD,
    type: "metric",
    query: "SELECT ID, TOTAL FROM ORDERS",
  });
  createSegmentWithFieldIdRef({
    name: VALID_SEGMENT,
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
  });
}

function createBrokenCards({ type }: { type: CardType }) {
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
  }
}

function createBrokenSegments() {
  createSegmentWithFieldIdRef({
    name: SEGMENT_COLUMN_ID_MISSING,
    tableId: ORDERS_ID,
    fieldId: REVIEWS.RATING,
  });
}

function createBrokenTransforms() {
  H.getTableId({ name: WRITABLE_TABLE_NAME, databaseId: WRITABLE_DB_ID }).then(
    (tableId) => {
      createTransformWithFieldIdRef({
        name: TRANSFORM_COLUMN_ID_MISSING,
        tableId: tableId,
        fieldId: 1000,
      });
      createTransformWithFieldIdRef({
        name: TRANSFORM_COLUMN_WRONG_TABLE,
        tableId: tableId,
        fieldId: ORDERS.TOTAL,
      });
      createNativeTransform({
        name: TRANSFORM_CARD_COLUMN_MISSING,
        query: `SELECT RATING FROM "${WRITABLE_TABLE_NAME}"`,
      });
      createNativeTransform({
        name: TRANSFORM_CARD_TABLE_ALIAS_MISSING,
        query: `SELECT P.ID, P.PRICE FROM "${WRITABLE_TABLE_NAME}"`,
      });
      createNativeTransform({
        name: TRANSFORM_CARD_SYNTAX_ERROR,
        query: "SELECT FROM",
      });
    },
  );
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

function createTransformWithFieldIdRef({
  name,
  tableId,
  fieldId,
}: {
  name: string;
  tableId: TableId;
  fieldId: FieldId;
}) {
  return H.createTransform({
    name,
    source: {
      type: "query",
      query: {
        type: "query",
        database: WRITABLE_DB_ID,
        query: {
          "source-table": tableId,
          filter: ["not-null", ["field", fieldId, null]],
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name,
      schema: "public",
    },
  });
}

function createNativeTransform({
  name,
  query,
}: {
  name: string;
  query: string;
}) {
  return H.createTransform({
    name,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: { query },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name,
      schema: "public",
    },
  });
}

function checkList({
  visibleEntities = [],
  hiddenEntities = [],
}: {
  visibleEntities?: string[];
  hiddenEntities?: string[];
}) {
  H.DataStudio.Tasks.list().within(() => {
    visibleEntities.forEach((name) => {
      cy.findByText(name).should("be.visible");
    });
    hiddenEntities.forEach((name) => {
      cy.findByText(name).should("not.exist");
    });
  });
}

function checkSidebar({
  entityName,
  errors = {},
}: {
  entityName: string;
  locationName?: string;
  creatorName?: string;
  errors?: Record<string, string[]>;
}) {
  H.DataStudio.Tasks.Sidebar.header()
    .findByText(entityName)
    .should("be.visible");

  Object.entries(errors).forEach(([label, errors]) => {
    H.DataStudio.Tasks.Sidebar.errorInfo(label).within(() => {
      errors.forEach((error) => {
        cy.findByText(error).should("be.visible");
      });
    });
  });
}

function openSidebarAndCheckErrors(
  errors: Record<string, Record<string, string[]>>,
) {
  Object.entries(errors).forEach(([entityName, errors]) => {
    H.DataStudio.Tasks.list().findByText(entityName).click();
    checkSidebar({
      entityName,
      errors,
    });
  });
}
