import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import Metric from "metabase-lib/v1/metadata/Metric";
import type { NormalizedMetric } from "metabase-types/api";
import { createMockMeasure } from "metabase-types/api/mocks/measure";
import {
  createMockMetricDimension,
  createMockNormalizedMetric,
} from "metabase-types/api/mocks/metric";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

export { createMockNormalizedMetric, createMockMetricDimension };

// ── Metric fixtures ──

export const REVENUE_METRIC = createMockNormalizedMetric({
  id: 1,
  name: "Revenue",
  dimensions: [
    createMockMetricDimension({
      id: "dim-created-at",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
    }),
    createMockMetricDimension({
      id: "dim-category",
      display_name: "Category",
      effective_type: "type/Text",
      semantic_type: "type/Category",
    }),
    createMockMetricDimension({
      id: "dim-amount",
      display_name: "Amount",
      effective_type: "type/Float",
      semantic_type: "type/Currency",
      sources: [{ type: "field", "field-id": 5 }],
    }),
    createMockMetricDimension({
      id: "dim-active",
      display_name: "Is Active",
      effective_type: "type/Boolean",
      semantic_type: null,
    }),
  ],
});

export const GEO_METRIC = createMockNormalizedMetric({
  id: 2,
  name: "Geo Revenue",
  dimensions: [
    createMockMetricDimension({
      id: "dim-state",
      display_name: "State",
      effective_type: "type/Text",
      semantic_type: "type/State",
    }),
    createMockMetricDimension({
      id: "dim-country",
      display_name: "Country",
      effective_type: "type/Text",
      semantic_type: "type/Country",
    }),
    createMockMetricDimension({
      id: "dim-city",
      display_name: "City",
      effective_type: "type/Text",
      semantic_type: "type/City",
    }),
    createMockMetricDimension({
      id: "dim-latitude",
      display_name: "Latitude",
      effective_type: "type/Float",
      semantic_type: "type/Latitude",
    }),
    createMockMetricDimension({
      id: "dim-longitude",
      display_name: "Longitude",
      effective_type: "type/Float",
      semantic_type: "type/Longitude",
    }),
    createMockMetricDimension({
      id: "dim-created-at",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
    }),
  ],
});

export function createMetricMetadata(metrics: NormalizedMetric[]): Metadata {
  const metadata = new Metadata();
  metadata.metrics = {};
  for (const metric of metrics) {
    const instance = new Metric(metric);
    instance.metadata = metadata;
    metadata.metrics[metric.id] = instance;
  }
  return metadata;
}

export function setupDefinition(
  metadata: Metadata,
  metricId: number,
): LibMetric.MetricDefinition {
  const provider = LibMetric.metadataProvider(metadata);
  const metricMeta = LibMetric.metricMetadata(provider, metricId);
  if (!metricMeta) {
    throw new Error(`Metric ${metricId} not found`);
  }
  return LibMetric.fromMetricMetadata(provider, metricMeta);
}

export function setupDefinitionWithBreakout(
  metadata: Metadata,
  metricId: number,
  dimensionIndex: number,
): LibMetric.MetricDefinition {
  const definition = setupDefinition(metadata, metricId);
  const dimensions = LibMetric.projectionableDimensions(definition);
  const dimensionRef = LibMetric.dimensionReference(dimensions[dimensionIndex]);
  return LibMetric.project(definition, dimensionRef);
}

// ── Measure fixtures ──

const sampleDatabase = createSampleDatabase({
  tables: [
    createOrdersTable(),
    createPeopleTable(),
    createProductsTable(),
    createReviewsTable(),
  ],
});

const baseMeasureMetadata = createMockMetadata({
  databases: [sampleDatabase],
});

const TOTAL_MEASURE_ID = 100;

export const TOTAL_MEASURE = createMockMeasure({
  id: TOTAL_MEASURE_ID,
  name: "Total Revenue",
  table_id: ORDERS_ID,
  definition: Lib.toJsQuery(
    Lib.createTestQuery(
      Lib.metadataProvider(SAMPLE_DB_ID, baseMeasureMetadata),
      {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [
              {
                type: "operator",
                operator: "sum",
                args: [
                  {
                    type: "column",
                    name: "TOTAL",
                    sourceName: "ORDERS",
                  },
                ],
              },
            ],
          },
        ],
      },
    ),
  ),
  dimensions: [
    createMockMetricDimension({
      id: "measure-dim-created-at",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
    }),
    createMockMetricDimension({
      id: "measure-dim-quantity",
      display_name: "Quantity",
      effective_type: "type/Integer",
      semantic_type: "type/Quantity",
    }),
    createMockMetricDimension({
      id: "measure-dim-total",
      display_name: "Total",
      effective_type: "type/Float",
      semantic_type: "type/Currency",
      sources: [{ type: "field", "field-id": ORDERS.TOTAL }],
    }),
  ],
  dimension_mappings: [
    {
      dimension_id: "measure-dim-created-at",
      table_id: ORDERS_ID,
      target: ["field", {}, ORDERS.CREATED_AT],
    },
    {
      dimension_id: "measure-dim-quantity",
      table_id: ORDERS_ID,
      target: ["field", {}, ORDERS.QUANTITY],
    },
    {
      dimension_id: "measure-dim-total",
      table_id: ORDERS_ID,
      target: ["field", {}, ORDERS.TOTAL],
    },
  ],
});

export const measureMetadata = createMockMetadata({
  databases: [sampleDatabase],
  measures: [TOTAL_MEASURE],
});

export function setupMeasureDefinition(
  metadata: Metadata,
  measureId: number,
): LibMetric.MetricDefinition {
  const provider = LibMetric.metadataProvider(metadata);
  const measureMeta = LibMetric.measureMetadata(provider, measureId);
  if (!measureMeta) {
    throw new Error(`Measure ${measureId} not found`);
  }
  return LibMetric.fromMeasureMetadata(provider, measureMeta);
}

export function setupMeasureDefinitionWithBreakout(
  metadata: Metadata,
  measureId: number,
  dimensionIndex: number,
): LibMetric.MetricDefinition {
  const definition = setupMeasureDefinition(metadata, measureId);
  const dimensions = LibMetric.projectionableDimensions(definition);
  const dimensionRef = LibMetric.dimensionReference(dimensions[dimensionIndex]);
  return LibMetric.project(definition, dimensionRef);
}
