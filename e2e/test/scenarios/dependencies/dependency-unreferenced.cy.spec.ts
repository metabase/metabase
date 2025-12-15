const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CardId, SegmentId, TableId } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const MODEL_1_NAME = "Model 1";
const MODEL_2_NAME = "Model 2";
const MODEL_3_NAME = "Model 3";
const SEGMENT_1_NAME = "Segment 1";
const SEGMENT_2_NAME = "Segment 2";
const SEGMENT_3_NAME = "Segment 3";
const SEGMENT_4_NAME = "Segment 4";
const METRIC_1_NAME = "Metric 1";
const METRIC_2_NAME = "Metric 2";
const METRIC_3_NAME = "Metric 3";
const SNIPPET_1_NAME = "Snippet 1";
const SNIPPET_2_NAME = "Snippet 2";

const ENTITY_NAMES = [
  MODEL_1_NAME,
  MODEL_2_NAME,
  MODEL_3_NAME,
  SEGMENT_1_NAME,
  SEGMENT_2_NAME,
  SEGMENT_3_NAME,
  SEGMENT_4_NAME,
  METRIC_1_NAME,
  METRIC_2_NAME,
  METRIC_3_NAME,
  SNIPPET_1_NAME,
  SNIPPET_2_NAME,
];

describe("scenarios > dependencies > unreferenced", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should show unreferenced entities", () => {
    createEntities({ withReferences: false });
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

function createEntities({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
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
    name: MODEL_1_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createQuestionWithModelDataSource({
        name: `${MODEL_1_NAME} -> Question`,
        modelId: model.id,
      });
    }
  });
  createModelWithTableDataSource({
    name: MODEL_2_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createModelWithModelDataSource({
        name: `${MODEL_2_NAME} -> Model`,
        modelId: model.id,
      });
    }
  });
  createModelWithTableDataSource({
    name: MODEL_3_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createMetricWithModelDataSource({
        name: `${MODEL_3_NAME} -> Metric`,
        modelId: model.id,
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
    name: SEGMENT_1_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createQuestionWithSegmentClause({
        name: `${SEGMENT_1_NAME} -> Question`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });
  createSegmentWithTableDataSource({
    name: SEGMENT_2_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createModelWithSegmentClause({
        name: `${SEGMENT_2_NAME} -> Model`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });
  createSegmentWithTableDataSource({
    name: SEGMENT_3_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createSegmentWithSegmentClause({
        name: `${SEGMENT_3_NAME} -> Segment`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });
  createSegmentWithTableDataSource({
    name: SEGMENT_4_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createMetricWithSegmentClause({
        name: `${SEGMENT_4_NAME} -> Metric`,
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
    name: METRIC_1_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createQuestionWithMetricClause({
        name: `${METRIC_1_NAME} -> Question`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });
  createMetricWithTableDataSource({
    name: METRIC_2_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createModelWithMetricClause({
        name: `${METRIC_2_NAME} -> Model`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });
  createMetricWithTableDataSource({
    name: METRIC_3_NAME,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createMetricWithMetricClause({
        name: `${METRIC_3_NAME} -> Metric`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });
}

function createSnippetContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createSnippetWithBasicFilter({ name: SNIPPET_1_NAME }).then(
    ({ body: filter }) => {
      if (withReferences) {
        createQuestionWithSnippetReference({
          name: `${SNIPPET_1_NAME} -> Question`,
          tableName: "ORDERS",
          snippetName: filter.name,
        });
      }
    },
  );

  createSnippetWithBasicFilter({ name: SNIPPET_2_NAME }).then(
    ({ body: filter }) => {
      if (withReferences) {
        createSnippetWithSnippetReference({
          name: `${SNIPPET_2_NAME} -> Snippet`,
          snippetName: filter.name,
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

function createQuestionWithSnippetReference({
  name,
  tableName,
  snippetName,
}: {
  name: string;
  tableName: string;
  snippetName: string;
}) {
  return H.createNativeQuestion({
    name,
    type: "question",
    native: {
      query: `select * from ${tableName} where {{snippet: ${snippetName}}}`,
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

function createSnippetWithSnippetReference({
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
