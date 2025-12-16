const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  CardId,
  FieldId,
  NativeQuerySnippetId,
  SegmentId,
  TableId,
} from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

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
  ...MODEL_NAMES,
  ...SEGMENT_NAMES,
  ...METRIC_NAMES,
  ...SNIPPET_NAMES,
];

describe("scenarios > dependencies > unreferenced", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.viewport(1280, 1400);
  });

  describe("analysis", () => {
    it("should show unreferenced entities", () => {
      createEntities();
      H.DataStudio.Tasks.visitUnreferencedEntities();
      H.DataStudio.Tasks.list().within(() => {
        ENTITY_NAMES.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });
    });

    it("should not show referenced entities", () => {
      createEntities({ withReferences: true });
      H.DataStudio.Tasks.visitUnreferencedEntities();
      H.DataStudio.Tasks.list().within(() => {
        ENTITY_NAMES.forEach((name) => {
          cy.findByText(name).should("not.exist");
        });
      });
    });
  });

  describe("search", () => {
    it("should search for entities", () => {
      createEntities();
      H.DataStudio.Tasks.visitUnreferencedEntities();
      H.DataStudio.Tasks.searchInput().type(MODEL_FOR_QUESTION_DATA_SOURCE);
      H.DataStudio.Tasks.list().within(() => {
        cy.findByText(MODEL_FOR_QUESTION_DATA_SOURCE).should("be.visible");
        cy.findByText(MODEL_FOR_MODEL_DATA_SOURCE).should("not.exist");
      });
    });

    it("should search for entities with type filters", () => {
      createEntities();
      H.DataStudio.Tasks.visitUnreferencedEntities();
      H.DataStudio.Tasks.searchInput().type("tag");
      H.DataStudio.Tasks.list().within(() => {
        cy.findByText(MODEL_FOR_QUESTION_DATA_SOURCE).should("not.exist");
        cy.findByText(MODEL_FOR_NATIVE_QUESTION_CARD_TAG).should("be.visible");
        cy.findByText(SNIPPET_FOR_SNIPPET_TAG).should("be.visible");
      });

      H.DataStudio.Tasks.filterButton().click();
      H.popover().findByText("Model").click();
      H.DataStudio.Tasks.list().within(() => {
        cy.findByText(MODEL_FOR_NATIVE_QUESTION_CARD_TAG).should("be.visible");
        cy.findByText(SNIPPET_FOR_SNIPPET_TAG).should("not.exist");
      });
    });
  });

  describe("filters", () => {
    it("should filter entities by type", () => {
      createEntities();
      H.DataStudio.Tasks.visitUnreferencedEntities();
      H.DataStudio.Tasks.list().within(() => {
        cy.findByText(MODEL_FOR_NATIVE_QUESTION_CARD_TAG).should("be.visible");
        cy.findByText(SEGMENT_FOR_QUESTION_FILTER).should("be.visible");
        cy.findByText(METRIC_FOR_QUESTION_AGGREGATION).should("be.visible");
        cy.findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG).should(
          "be.visible",
        );
      });

      H.DataStudio.Tasks.filterButton().click();
      H.popover().findByText("Model").click();
      H.DataStudio.Tasks.list().within(() => {
        cy.findByText(MODEL_FOR_NATIVE_QUESTION_CARD_TAG).should("be.visible");
        cy.findByText(SEGMENT_FOR_QUESTION_FILTER).should("not.exist");
        cy.findByText(METRIC_FOR_QUESTION_AGGREGATION).should("not.exist");
        cy.findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG).should("not.exist");
      });

      H.popover().findByText("Segment").click();
      H.DataStudio.Tasks.list().within(() => {
        cy.findByText(MODEL_FOR_NATIVE_QUESTION_CARD_TAG).should("be.visible");
        cy.findByText(SEGMENT_FOR_QUESTION_FILTER).should("be.visible");
        cy.findByText(METRIC_FOR_QUESTION_AGGREGATION).should("not.exist");
        cy.findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG).should("not.exist");
      });

      H.popover().findByText("Metric").click();
      H.DataStudio.Tasks.list().within(() => {
        cy.findByText(MODEL_FOR_NATIVE_QUESTION_CARD_TAG).should("be.visible");
        cy.findByText(SEGMENT_FOR_QUESTION_FILTER).should("be.visible");
        cy.findByText(METRIC_FOR_QUESTION_AGGREGATION).should("be.visible");
        cy.findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG).should("not.exist");
      });

      H.popover().findByText("Snippet").click();
      H.DataStudio.Tasks.list().within(() => {
        cy.findByText(MODEL_FOR_NATIVE_QUESTION_CARD_TAG).should("be.visible");
        cy.findByText(SEGMENT_FOR_QUESTION_FILTER).should("be.visible");
        cy.findByText(METRIC_FOR_QUESTION_AGGREGATION).should("be.visible");
        cy.findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG).should(
          "be.visible",
        );
      });
    });
  });

  describe("sidebar", () => {
    it("should show the sidebar for supported entities", () => {
      createEntities();
      H.DataStudio.Tasks.visitUnreferencedEntities();

      H.DataStudio.Tasks.list()
        .findByText(MODEL_FOR_QUESTION_DATA_SOURCE)
        .click();
      H.DataStudio.Tasks.sidebar().within(() => {
        cy.findByText(MODEL_FOR_QUESTION_DATA_SOURCE).should("be.visible");
        cy.findByText("Our analytics").should("be.visible");
      });

      H.DataStudio.Tasks.list().findByText(SEGMENT_FOR_QUESTION_FILTER).click();
      H.DataStudio.Tasks.sidebar().within(() => {
        cy.findByText(SEGMENT_FOR_QUESTION_FILTER).should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });

      H.DataStudio.Tasks.list()
        .findByText(METRIC_FOR_QUESTION_AGGREGATION)
        .click();
      H.DataStudio.Tasks.sidebar().within(() => {
        cy.findByText(METRIC_FOR_QUESTION_AGGREGATION).should("be.visible");
        cy.findByText("Our analytics").should("be.visible");
      });

      H.DataStudio.Tasks.list()
        .findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG)
        .click();
      H.DataStudio.Tasks.sidebar().within(() => {
        cy.findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG).should(
          "be.visible",
        );
        cy.findByText("Location").should("not.exist");
      });
    });
  });
});

function createEntities({
  withReferences = false,
}: { withReferences?: boolean } = {}) {
  createModelContent({ withReferences });
  createSegmentContent({ withReferences });
  createMetricContent({ withReferences });
  createSnippetContent({ withReferences });
}

function createModelContent({
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

function createSegmentContent({
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

function createMetricContent({
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

function createSnippetContent({
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
}: {
  name: string;
  tableId: TableId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": tableId,
    },
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
}: {
  name: string;
  tableId: TableId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["count"]],
    },
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
