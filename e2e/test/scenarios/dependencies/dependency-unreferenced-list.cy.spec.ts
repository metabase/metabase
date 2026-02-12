import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ADMIN_USER_ID,
  FIRST_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  CardId,
  CollectionId,
  FieldId,
  NativeQuerySnippetId,
  SegmentId,
  TableId,
} from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { H } = cy;
const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const DATABASE_NAME = "Writable Postgres12";
const TABLE_NAME = "many_data_types";
const TABLE_DISPLAY_NAME = "Many Data Types";
const TABLE_DESCRIPTION = "This is a table with many data types";
const MODEL_FOR_QUESTION_DATA_SOURCE = "Model for question data source";
const MODEL_FOR_MODEL_DATA_SOURCE = "Model for model data source";
const MODEL_FOR_METRIC_DATA_SOURCE = "Model for metric data source";
const MODEL_FOR_NATIVE_QUESTION_CARD_TAG = "Model for native question card tag";
const MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE =
  "Model for native question parameter source";
const MODEL_FOR_DASHBOARD_CARD = "Model for dashboard card";
const MODEL_FOR_DASHBOARD_PARAMETER_SOURCE =
  "Model for dashboard parameter source";
const SEGMENT_FOR_QUESTION_FILTER = "Segment for question filter";
const SEGMENT_FOR_MODEL_FILTER = "Segment for model filter";
const SEGMENT_FOR_SEGMENT_FILTER = "Segment for segment filter";
const SEGMENT_FOR_METRIC_FILTER = "Segment for metric filter";
const METRIC_FOR_QUESTION_AGGREGATION = "Metric for question aggregation";
const METRIC_FOR_MODEL_AGGREGATION = "Metric for model aggregation";
const METRIC_FOR_METRIC_AGGREGATION = "Metric for metric aggregation";
const METRIC_FOR_DASHBOARD_CARD = "Metric for dashboard card";
const SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG =
  "Snippet for native question card tag";
const SNIPPET_FOR_SNIPPET_TAG = "Snippet for snippet tag";

const TABLE_NAMES = [TABLE_DISPLAY_NAME];

const MODEL_NAMES = [
  MODEL_FOR_QUESTION_DATA_SOURCE,
  MODEL_FOR_MODEL_DATA_SOURCE,
  MODEL_FOR_METRIC_DATA_SOURCE,
  MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
  MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
  MODEL_FOR_DASHBOARD_CARD,
  MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
];

const SEGMENT_NAMES = [
  SEGMENT_FOR_QUESTION_FILTER,
  SEGMENT_FOR_MODEL_FILTER,
  SEGMENT_FOR_SEGMENT_FILTER,
  SEGMENT_FOR_METRIC_FILTER,
];

const METRIC_NAMES = [
  METRIC_FOR_QUESTION_AGGREGATION,
  METRIC_FOR_MODEL_AGGREGATION,
  METRIC_FOR_METRIC_AGGREGATION,
  METRIC_FOR_DASHBOARD_CARD,
];

const SNIPPET_NAMES = [
  SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
  SNIPPET_FOR_SNIPPET_TAG,
];

const ENTITY_NAMES = [
  ...TABLE_NAMES,
  ...MODEL_NAMES,
  ...SEGMENT_NAMES,
  ...METRIC_NAMES,
  ...SNIPPET_NAMES,
];

const MODELS_SORTED_BY_NAME = [
  MODEL_FOR_DASHBOARD_CARD,
  MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
  MODEL_FOR_METRIC_DATA_SOURCE,
  MODEL_FOR_MODEL_DATA_SOURCE,
  MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
  MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
  MODEL_FOR_QUESTION_DATA_SOURCE,
];

const MODELS_SORTED_BY_LOCATION = [
  MODEL_FOR_METRIC_DATA_SOURCE,
  MODEL_FOR_MODEL_DATA_SOURCE,
  MODEL_FOR_QUESTION_DATA_SOURCE,
  MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
  MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
  MODEL_FOR_DASHBOARD_CARD,
  MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
];

describe("scenarios > dependencies > unreferenced list", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: TABLE_NAME });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TABLE_NAME });
    cy.viewport(1600, 1400);
  });

  describe("analysis", () => {
    it("should show unreferenced entities", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      H.DependencyDiagnostics.list().within(() => {
        ENTITY_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });

    it("should not show referenced entities", () => {
      setupEntities({ withReferences: true });
      H.DependencyDiagnostics.visitUnreferencedEntities();
      H.DependencyDiagnostics.list().within(() => {
        ENTITY_NAMES.forEach((name) => {
          cy.findByText(name).should("not.exist");
        });
      });
    });
  });

  describe("search", () => {
    it("should search for entities", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      H.DependencyDiagnostics.searchInput().type(
        MODEL_FOR_QUESTION_DATA_SOURCE,
      );
      checkList({
        visibleEntities: [MODEL_FOR_QUESTION_DATA_SOURCE],
        hiddenEntities: [MODEL_FOR_MODEL_DATA_SOURCE],
      });
    });

    it("should search for entities with type filters", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      H.DependencyDiagnostics.searchInput().type("tag");
      checkList({
        visibleEntities: [
          MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
          SNIPPET_FOR_SNIPPET_TAG,
        ],
        hiddenEntities: [MODEL_FOR_QUESTION_DATA_SOURCE],
      });

      H.DependencyDiagnostics.filterButton().click();
      H.popover().findByText("Snippet").click();
      checkList({
        visibleEntities: [MODEL_FOR_NATIVE_QUESTION_CARD_TAG],
        hiddenEntities: [SNIPPET_FOR_SNIPPET_TAG],
      });
    });
  });

  describe("filters", () => {
    it("should filter entities by type", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      checkList({ visibleEntities: ENTITY_NAMES });

      H.DependencyDiagnostics.filterButton().click();
      H.popover().findByText("Model").click();
      checkList({ hiddenEntities: [MODEL_FOR_NATIVE_QUESTION_CARD_TAG] });

      H.popover().findByText("Segment").click();
      checkList({
        hiddenEntities: [
          MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
          SEGMENT_FOR_QUESTION_FILTER,
        ],
      });

      H.popover().findByText("Metric").click();
      checkList({
        hiddenEntities: [
          MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
          SEGMENT_FOR_QUESTION_FILTER,
          METRIC_FOR_QUESTION_AGGREGATION,
        ],
      });

      H.popover().findByText("Model").click();
      checkList({ visibleEntities: [MODEL_FOR_NATIVE_QUESTION_CARD_TAG] });
    });

    it("should persist filter changes after page reload", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      checkList({ visibleEntities: MODEL_NAMES });

      H.DependencyDiagnostics.filterButton().click();
      H.popover().findByText("Model").click();
      checkList({ hiddenEntities: MODEL_NAMES });

      H.DependencyDiagnostics.visitUnreferencedEntities();
      checkList({ visibleEntities: METRIC_NAMES, hiddenEntities: MODEL_NAMES });
    });

    it("should filter by location", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      checkList({
        visibleEntities: [
          MODEL_FOR_MODEL_DATA_SOURCE,
          MODEL_FOR_METRIC_DATA_SOURCE,
          SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
        ],
      });

      H.DependencyDiagnostics.filterButton().click();
      H.popover().findByText("Include items in personal collections").click();
      checkList({
        visibleEntities: [
          MODEL_FOR_MODEL_DATA_SOURCE,
          SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
        ],
        hiddenEntities: [MODEL_FOR_METRIC_DATA_SOURCE],
      });

      H.popover().findByText("Include items in personal collections").click();
      checkList({
        visibleEntities: [
          MODEL_FOR_MODEL_DATA_SOURCE,
          MODEL_FOR_METRIC_DATA_SOURCE,
          SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
        ],
      });
    });
  });

  describe("sorting", () => {
    it("should sort by name", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      H.DependencyDiagnostics.searchInput().type("Model for");

      cy.log("sorted by name by default");
      checkListSorting({
        visibleEntities: MODELS_SORTED_BY_NAME,
      });

      cy.log("sorted by name ascending");
      H.DependencyDiagnostics.list().findByText("Name").click();
      checkListSorting({
        visibleEntities: MODELS_SORTED_BY_NAME,
      });

      cy.log("sorted by name descending");
      H.DependencyDiagnostics.list().findByText("Name").click();
      checkListSorting({
        visibleEntities: [...MODELS_SORTED_BY_NAME].reverse(),
      });
    });

    it("should sort by location", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      H.DependencyDiagnostics.searchInput().type("Model for");

      cy.log("sorted by location ascending");
      H.DependencyDiagnostics.list().findByText("Location").click();
      checkListSorting({
        visibleEntities: MODELS_SORTED_BY_LOCATION,
      });

      cy.log("sorted by location descending");
      H.DependencyDiagnostics.list().findByText("Location").click();
      checkListSorting({
        visibleEntities: [...MODELS_SORTED_BY_LOCATION].reverse(),
      });
    });

    it("should persist sorting changes after page reload", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();
      H.DependencyDiagnostics.searchInput().type("Model for");

      H.DependencyDiagnostics.list().findByText("Location").click();
      checkListSorting({ visibleEntities: MODELS_SORTED_BY_LOCATION });

      H.DependencyDiagnostics.visitUnreferencedEntities();
      H.DependencyDiagnostics.searchInput().type("Model for");
      checkListSorting({ visibleEntities: MODELS_SORTED_BY_LOCATION });
    });
  });

  describe("sidebar", () => {
    it("should show the sidebar for supported entities", () => {
      setupEntities();
      H.DependencyDiagnostics.visitUnreferencedEntities();

      H.DependencyDiagnostics.list().findByText(TABLE_DISPLAY_NAME).click();
      checkSidebar({
        title: TABLE_DISPLAY_NAME,
        location: DATABASE_NAME,
        description: TABLE_DESCRIPTION,
        owner: `${USERS.admin.first_name} ${USERS.admin.last_name}`,
        fields: ["ID", "UUID"],
      });

      H.DependencyDiagnostics.list()
        .findByText(MODEL_FOR_QUESTION_DATA_SOURCE)
        .click();
      checkSidebar({
        title: MODEL_FOR_QUESTION_DATA_SOURCE,
        location: "Our analytics",
        createdBy: "Bobby Tables",
        fields: ["User ID"],
      });

      H.DependencyDiagnostics.list()
        .findByText(MODEL_FOR_MODEL_DATA_SOURCE)
        .click();
      checkSidebar({
        title: MODEL_FOR_MODEL_DATA_SOURCE,
        location: "First collection",
        createdBy: "Bobby Tables",
      });

      H.DependencyDiagnostics.list()
        .findByText(SEGMENT_FOR_QUESTION_FILTER)
        .click();
      checkSidebar({
        title: SEGMENT_FOR_QUESTION_FILTER,
        location: "Orders",
        createdBy: "Bobby Tables",
      });

      H.DependencyDiagnostics.list()
        .findByText(METRIC_FOR_QUESTION_AGGREGATION)
        .click();
      checkSidebar({
        title: METRIC_FOR_QUESTION_AGGREGATION,
        location: "Our analytics",
        createdBy: "Bobby Tables",
      });

      H.DependencyDiagnostics.list()
        .findByText(METRIC_FOR_MODEL_AGGREGATION)
        .click();
      checkSidebar({
        title: METRIC_FOR_MODEL_AGGREGATION,
        location: "First collection",
        createdBy: "Bobby Tables",
      });

      H.DependencyDiagnostics.list()
        .findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG)
        .click();
      checkSidebar({
        title: SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
        location: "SQL snippets",
        createdBy: "Bobby Tables",
      });
    });
  });
});

function setupEntities({
  withReferences = false,
}: { withReferences?: boolean } = {}) {
  setupTableContent();
  setupModelContent({ withReferences });
  setupSegmentContent({ withReferences });
  setupMetricContent({ withReferences });
  setupSnippetContent({ withReferences });
}

function setupTableContent() {
  H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    cy.request("PUT", `/api/table/${tableId}`, {
      display_name: TABLE_DISPLAY_NAME,
      description: TABLE_DESCRIPTION,
      owner_user_id: ADMIN_USER_ID,
    });
  });
}

function setupModelContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createModelWithTableDataSource({
    name: MODEL_FOR_QUESTION_DATA_SOURCE,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createQuestionWithModelDataSource({
        name: `${MODEL_FOR_QUESTION_DATA_SOURCE} -> Question`,
        modelId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_MODEL_DATA_SOURCE,
    tableId: ORDERS_ID,
    collectionId: FIRST_COLLECTION_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createModelWithModelDataSource({
        name: `${MODEL_FOR_MODEL_DATA_SOURCE} -> Model`,
        modelId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_METRIC_DATA_SOURCE,
    tableId: ORDERS_ID,
    collectionId: ADMIN_PERSONAL_COLLECTION_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createMetricWithModelDataSource({
        name: `${MODEL_FOR_METRIC_DATA_SOURCE} -> Metric`,
        modelId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createNativeQuestionWithCardTag({
        name: `${MODEL_FOR_NATIVE_QUESTION_CARD_TAG} -> Question`,
        cardId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
    tableId: PRODUCTS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createNativeQuestionWithParameterWithCardSource({
        name: `${MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE} -> Question`,
        tableName: "PRODUCTS",
        tableFieldId: PRODUCTS.CATEGORY,
        cardId: model.id,
        cardFieldName: "CATEGORY",
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_DASHBOARD_CARD,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createDashboardWithCard({
        name: `${MODEL_FOR_DASHBOARD_CARD} -> Dashboard Card`,
        cardId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
    tableId: PRODUCTS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createDashboardWithParameterWithCardSource({
        name: `${MODEL_FOR_DASHBOARD_PARAMETER_SOURCE} -> Dashboard`,
        cardId: model.id,
        cardFieldName: "CATEGORY",
      });
    }
  });
}

function setupSegmentContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createSegmentWithTableDataSource({
    name: SEGMENT_FOR_QUESTION_FILTER,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createQuestionWithSegmentClause({
        name: `${SEGMENT_FOR_QUESTION_FILTER} -> Question`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });

  createSegmentWithTableDataSource({
    name: SEGMENT_FOR_MODEL_FILTER,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createModelWithSegmentClause({
        name: `${SEGMENT_FOR_MODEL_FILTER} -> Model`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });

  createSegmentWithTableDataSource({
    name: SEGMENT_FOR_SEGMENT_FILTER,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createSegmentWithSegmentClause({
        name: `${SEGMENT_FOR_SEGMENT_FILTER} -> Segment`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });

  createSegmentWithTableDataSource({
    name: SEGMENT_FOR_METRIC_FILTER,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createMetricWithSegmentClause({
        name: `${SEGMENT_FOR_METRIC_FILTER} -> Metric`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });
}

function setupMetricContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createMetricWithTableDataSource({
    name: METRIC_FOR_QUESTION_AGGREGATION,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createQuestionWithMetricClause({
        name: `${METRIC_FOR_QUESTION_AGGREGATION} -> Question`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });

  createMetricWithTableDataSource({
    name: METRIC_FOR_MODEL_AGGREGATION,
    tableId: ORDERS_ID,
    collectionId: FIRST_COLLECTION_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createModelWithMetricClause({
        name: `${METRIC_FOR_MODEL_AGGREGATION} -> Model`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });

  createMetricWithTableDataSource({
    name: METRIC_FOR_METRIC_AGGREGATION,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createMetricWithMetricClause({
        name: `${METRIC_FOR_METRIC_AGGREGATION} -> Metric`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });

  createMetricWithTableDataSource({
    name: METRIC_FOR_DASHBOARD_CARD,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createDashboardWithCard({
        name: `${METRIC_FOR_DASHBOARD_CARD} -> Dashboard Card`,
        cardId: metric.id,
      });
    }
  });
}

function setupSnippetContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createSnippetWithBasicFilter({
    name: SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
  }).then(({ body: snippet }) => {
    if (withReferences) {
      createNativeQuestionWithSnippetTag({
        name: `${SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG} -> Question`,
        tableName: "ORDERS",
        snippetId: snippet.id,
        snippetName: snippet.name,
      });
    }
  });

  createSnippetWithBasicFilter({ name: SNIPPET_FOR_SNIPPET_TAG }).then(
    ({ body: snippet }) => {
      if (withReferences) {
        createSnippetWithSnippetTag({
          name: `${SNIPPET_FOR_SNIPPET_TAG} -> Snippet`,
          snippetName: snippet.name,
        });
      }
    },
  );
}

function createQuestionWithModelDataSource({
  name,
  modelId,
}: {
  name: string;
  modelId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
}

function createQuestionWithSegmentClause({
  name,
  tableId,
  segmentId,
}: {
  name: string;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createQuestion({
    name,
    type: "question",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createQuestionWithMetricClause({
  name,
  tableId,
  metricId,
}: {
  name: string;
  tableId: TableId;
  metricId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "question",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createNativeQuestionWithCardTag({
  name,
  cardId,
}: {
  name: string;
  cardId: CardId;
}) {
  const tagName = `#${cardId}`;

  return H.createNativeQuestion({
    name,
    type: "question",
    native: {
      query: `select * from {{${tagName}}}`,
      "template-tags": {
        [tagName]: {
          id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
          type: "card",
          name: tagName,
          "display-name": tagName,
          "card-id": cardId,
        },
      },
    },
  });
}

function createNativeQuestionWithParameterWithCardSource({
  name,
  tableName,
  tableFieldId,
  cardId,
  cardFieldName,
}: {
  name: string;
  tableName: string;
  tableFieldId: FieldId;
  cardId: CardId;
  cardFieldName: string;
}) {
  return H.createNativeQuestion({
    name,
    native: {
      query: `select * from ${tableName} where {{filter}}`,
      "template-tags": {
        filter: {
          id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
          type: "dimension",
          name: "filter",
          "display-name": "Filter",
          dimension: ["field", tableFieldId, null],
          "widget-type": "string/=",
        },
      },
    },
    parameters: [
      createMockParameter({
        id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
        name: "Filter",
        slug: "filter",
        type: "string/=",
        target: ["dimension", ["template-tag", "filter"]],
        values_source_type: "card",
        values_source_config: {
          card_id: cardId,
          value_field: ["field", cardFieldName, { "base-type": "type/Text" }],
        },
      }),
    ],
  });
}

function createNativeQuestionWithSnippetTag({
  name,
  tableName,
  snippetId,
  snippetName,
}: {
  name: string;
  tableName: string;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  const tagName = `snippet: ${snippetName}`;

  return H.createNativeQuestion({
    name,
    type: "question",
    native: {
      query: `select * from ${tableName} where {{${tagName}}}`,
      "template-tags": {
        [tagName]: {
          id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
          type: "snippet",
          name: tagName,
          "display-name": snippetName,
          "snippet-id": snippetId,
          "snippet-name": snippetName,
        },
      },
    },
  });
}

function createModelWithTableDataSource({
  name,
  tableId,
  collectionId,
}: {
  name: string;
  tableId: TableId;
  collectionId?: CollectionId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": tableId,
    },
    collection_id: collectionId,
  });
}

function createModelWithModelDataSource({
  name,
  modelId,
}: {
  name: string;
  modelId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
}

function createModelWithSegmentClause({
  name,
  tableId,
  segmentId,
}: {
  name: string;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createModelWithMetricClause({
  name,
  tableId,
  metricId,
}: {
  name: string;
  tableId: TableId;
  metricId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createSegmentWithTableDataSource({
  name,
  tableId,
}: {
  name: string;
  tableId: TableId;
}) {
  return H.createSegment({
    name,
    table_id: tableId,
    definition: {
      "source-table": tableId,
      filter: [["=", "A", "A"]],
    },
  });
}

function createSegmentWithSegmentClause({
  name,
  tableId,
  segmentId,
}: {
  name: string;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createSegment({
    name,
    table_id: tableId,
    definition: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createMetricWithTableDataSource({
  name,
  tableId,
  collectionId,
}: {
  name: string;
  tableId: TableId;
  collectionId?: CollectionId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["count"]],
    },
    collection_id: collectionId,
  });
}

function createMetricWithModelDataSource({
  name,
  modelId,
}: {
  name: string;
  modelId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": `card__${modelId}`,
      aggregation: [["count"]],
    },
  });
}

function createMetricWithSegmentClause({
  name,
  tableId,
  segmentId,
}: {
  name: string;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
      aggregation: [["count"]],
    },
  });
}

function createMetricWithMetricClause({
  name,
  tableId,
  metricId,
}: {
  name: string;
  tableId: TableId;
  metricId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createSnippetWithBasicFilter({ name }: { name: string }) {
  return H.createSnippet({
    name,
    content: "1 = 1",
  });
}

function createSnippetWithSnippetTag({
  name,
  snippetName,
}: {
  name: string;
  snippetName: string;
}) {
  return H.createSnippet({
    name,
    content: `{{snippet: ${snippetName}}}`,
  });
}

function createDashboardWithCard({
  name,
  cardId,
}: {
  name: string;
  cardId: CardId;
}) {
  return H.createDashboard({ name }).then(({ body: dashboard }) => {
    H.updateDashboardCards({
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: cardId,
        },
      ],
    });
  });
}

function createDashboardWithParameterWithCardSource({
  name,
  cardId,
  cardFieldName,
}: {
  name: string;
  cardId: CardId;
  cardFieldName: string;
}) {
  return H.createDashboard({
    name,
    parameters: [
      createMockParameter({
        id: "10422a0f",
        name: "Filter",
        slug: "filter",
        type: "string/=",
        values_source_type: "card",
        values_source_config: {
          card_id: cardId,
          value_field: ["field", cardFieldName, { "base-type": "type/Text" }],
        },
      }),
    ],
  });
}

function checkList({
  visibleEntities = [],
  hiddenEntities = [],
}: {
  visibleEntities?: string[];
  hiddenEntities?: string[];
}) {
  H.DependencyDiagnostics.list().within(() => {
    visibleEntities.forEach((name) => {
      cy.findByText(name).scrollIntoView().should("be.visible");
    });
    hiddenEntities.forEach((name) => {
      cy.findByText(name).should("not.exist");
    });
  });
}

function checkListSorting({ visibleEntities }: { visibleEntities: string[] }) {
  H.DependencyDiagnostics.list().within(() => {
    visibleEntities.forEach((name, index) => {
      cy.findByText(name)
        .parents("[data-index]")
        .should("have.attr", "data-index", index.toString());
    });
  });
}

function checkSidebar({
  title,
  location,
  description,
  owner,
  createdBy,
  fields = [],
}: {
  title: string;
  location?: string;
  description?: string;
  owner?: string;
  createdBy?: string;
  fields?: string[];
}) {
  const Sidebar = H.DependencyDiagnostics.Sidebar;

  H.DependencyDiagnostics.sidebar().within(() => {
    Sidebar.header().findByText(title).should("be.visible");
    if (location) {
      Sidebar.locationSection()
        .findByText(location)
        .scrollIntoView()
        .should("be.visible");
    }
    if (description) {
      Sidebar.infoSection().should("contain.text", description);
    }
    if (owner) {
      Sidebar.infoSection().should("contain.text", owner);
    }
    if (createdBy) {
      Sidebar.infoSection().should("contain.text", createdBy);
    }
    if (fields.length > 0) {
      Sidebar.fieldsSection().within(() => {
        fields.forEach((field) => {
          cy.findByText(field).scrollIntoView().should("be.visible");
        });
      });
    }
  });
}
