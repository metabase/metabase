const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { CardId, CardType, FieldId, TableId } from "metabase-types/api";

const { ORDERS_ID, ORDERS, REVIEWS } = SAMPLE_DATABASE;

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

const SEGMENT_COLUMN_MISSING = "Segment with a non-existing column";
const BROKEN_SEGMENT_NAMES = [SEGMENT_COLUMN_MISSING];

describe("scenarios > dependencies > broken list", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
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
      H.DataStudio.Tasks.visitBrokenEntities();
      checkList({
        visibleEntities: [...BROKEN_CARD_NAMES, ...BROKEN_SEGMENT_NAMES],
      });

      H.DataStudio.Tasks.filterButton().click();
      H.popover().findByText("Question").click();
      checkList({
        visibleEntities: [...BROKEN_CARD_NAMES],
        hiddenEntities: [...BROKEN_SEGMENT_NAMES],
      });

      H.popover().within(() => {
        cy.findByText("Question").click();
        cy.findByText("Segment").click();
      });
      checkList({
        visibleEntities: [...BROKEN_SEGMENT_NAMES],
        hiddenEntities: [...BROKEN_CARD_NAMES],
      });
    });
  });

  describe("sidebar", () => {
    it("should show the sidebar for questions with error info", () => {
      createBrokenCards({ type: "question" });
      H.DataStudio.Tasks.visitBrokenEntities();

      Object.entries(BROKEN_CARD_ERRORS).forEach(([entityName, errors]) => {
        H.DataStudio.Tasks.list().findByText(entityName).click();
        checkSidebar({
          entityName,
          errors,
        });
      });
    });

    it("should show the sidebar for models with error info", () => {
      createBrokenCards({ type: "model" });
      H.DataStudio.Tasks.visitBrokenEntities();

      Object.entries(BROKEN_CARD_ERRORS).forEach(([entityName, errors]) => {
        H.DataStudio.Tasks.list().findByText(entityName).click();
        checkSidebar({
          entityName,
          errors,
        });
      });
    });

    it("should show the sidebar for models with error info", () => {
      createBrokenCards({ type: "question" });
      H.DataStudio.Tasks.visitBrokenEntities();

      Object.entries(BROKEN_MBQL_CARD_ERRORS).forEach(
        ([entityName, errors]) => {
          H.DataStudio.Tasks.list().findByText(entityName).click();
          checkSidebar({
            entityName,
            errors,
          });
        },
      );
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
    name: SEGMENT_COLUMN_MISSING,
    tableId: ORDERS_ID,
    fieldId: REVIEWS.RATING,
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
  locationName,
  creatorName,
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

  if (locationName) {
    H.DataStudio.Tasks.Sidebar.locationInfo()
      .findByText(locationName)
      .should("be.visible");
  }

  if (creatorName) {
    H.DataStudio.Tasks.Sidebar.creationInfo().should(
      "contain.text",
      creatorName,
    );
  }

  Object.entries(errors).forEach(([label, errors]) => {
    H.DataStudio.Tasks.Sidebar.errorInfo(label).within(() => {
      errors.forEach((error) => {
        cy.findByText(error).should("be.visible");
      });
    });
  });
}
