const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CardId, SegmentId, TableId } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dependencies > unreferenced", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to see unreferenced entities", () => {
    createEntities({ withReferences: false });
    H.DataStudio.Tasks.visitUnreferencedEntities();
  });
});

function createEntities({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createTableBasedModel({ name: "Model", tableId: ORDERS_ID }).then(
    ({ body: model }) => {
      if (withReferences) {
        createModelBasedQuestion({
          name: "Model -> Question",
          modelId: model.id,
        });
        createModelBasedModel({ name: "Model -> Model", modelId: model.id });
        createModelBasedMetric({ name: "Model -> Metric", modelId: model.id });
      }
    },
  );
  createTableBasedSegment({ name: "Segment", tableId: ORDERS_ID }).then(
    ({ body: segment }) => {
      if (withReferences) {
        createSegmentBasedQuestion({
          name: "Segment -> Question",
          tableId: ORDERS_ID,
          segmentId: segment.id,
        });
        createSegmentBasedModel({
          name: "Segment -> Model",
          tableId: ORDERS_ID,
          segmentId: segment.id,
        });
        createSegmentBasedSegment({
          name: "Segment -> Segment",
          tableId: ORDERS_ID,
          segmentId: segment.id,
        });
        createSegmentBasedMetric({
          name: "Segment -> Metric",
          tableId: ORDERS_ID,
          segmentId: segment.id,
        });
      }
    },
  );
  createTableBasedMetric({ name: "Metric", tableId: ORDERS_ID }).then(
    ({ body: metric }) => {
      if (withReferences) {
        createMetricBasedQuestion({
          name: "Metric -> Question",
          tableId: ORDERS_ID,
          metricId: metric.id,
        });
        createMetricBasedModel({
          name: "Metric -> Model",
          tableId: ORDERS_ID,
          metricId: metric.id,
        });
        createMetricBasedMetric({
          name: "Metric -> Metric",
          tableId: ORDERS_ID,
          metricId: metric.id,
        });
      }
    },
  );
}

function createModelBasedQuestion({
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

function createSegmentBasedQuestion({
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

function createMetricBasedQuestion({
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

function createTableBasedModel({
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

function createModelBasedModel({
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

function createSegmentBasedModel({
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

function createMetricBasedModel({
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

function createTableBasedSegment({
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

function createSegmentBasedSegment({
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

function createTableBasedMetric({
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

function createModelBasedMetric({
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

function createSegmentBasedMetric({
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

function createMetricBasedMetric({
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
