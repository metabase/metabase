import * as LibMetric from "metabase-lib/metric";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import Metric from "metabase-lib/v1/metadata/Metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SourceColorMap,
} from "../types/viewer-state";

import { buildLegendGroups } from "./legend";

const REVENUE_METRIC = createMockMetric({
  id: 1,
  name: "Revenue",
  dimensions: [
    createMockMetricDimension({
      id: "dim-1",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
    }),
    createMockMetricDimension({
      id: "dim-2",
      display_name: "Category",
      effective_type: "type/Text",
      semantic_type: "type/Category",
    }),
  ],
});

const ORDERS_METRIC = createMockMetric({
  id: 2,
  name: "Orders",
  dimensions: [
    createMockMetricDimension({
      id: "dim-3",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
    }),
  ],
});

function createMetadata(metrics: ReturnType<typeof createMockMetric>[]) {
  const metadata = new Metadata();
  metadata.metrics = {};
  for (const metric of metrics) {
    const instance = new Metric(metric as any);
    instance.metadata = metadata;
    metadata.metrics[metric.id] = instance;
  }
  return metadata;
}

function setupDefinition(
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

function setupDefinitionWithBreakout(
  metadata: Metadata,
  metricId: number,
  dimensionIndex: number,
): LibMetric.MetricDefinition {
  const definition = setupDefinition(metadata, metricId);
  const dimensions = LibMetric.projectionableDimensions(definition);
  const dimensionRef = LibMetric.dimensionReference(dimensions[dimensionIndex]);
  return LibMetric.project(definition, dimensionRef);
}

describe("buildLegendGroups", () => {
  it("returns empty array when no definitions have breakouts", () => {
    const metadata = createMetadata([REVENUE_METRIC]);
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);

    const definitions: MetricsViewerDefinitionEntry[] = [
      { id: "metric:1", definition },
    ];
    const breakoutValues = new Map<
      MetricSourceId,
      MetricBreakoutValuesResponse
    >();
    const colors: SourceColorMap = { "metric:1": ["#509EE3"] };

    expect(buildLegendGroups(definitions, breakoutValues, colors)).toEqual([]);
  });

  it("builds legend groups for definitions with and without breakouts", () => {
    const metadata = createMetadata([REVENUE_METRIC, ORDERS_METRIC]);
    const revenueDefinition = setupDefinitionWithBreakout(
      metadata,
      REVENUE_METRIC.id,
      1,
    );
    const ordersDefinition = setupDefinition(metadata, ORDERS_METRIC.id);

    const definitions: MetricsViewerDefinitionEntry[] = [
      { id: "metric:1", definition: revenueDefinition },
      { id: "metric:2", definition: ordersDefinition },
    ];

    const breakoutValues = new Map<
      MetricSourceId,
      MetricBreakoutValuesResponse
    >([
      [
        "metric:1",
        {
          values: ["Gadgets", "Widgets"],
          col: { name: "CATEGORY" } as any,
        },
      ],
    ]);

    const colors: SourceColorMap = {
      "metric:1": ["#509EE3", "#88BF4D"],
      "metric:2": ["#A989C5"],
    };

    expect(buildLegendGroups(definitions, breakoutValues, colors)).toEqual([
      {
        header: "Category",
        subtitle: "Revenue",
        items: [
          { label: "Gadgets", color: "#509EE3" },
          { label: "Widgets", color: "#88BF4D" },
        ],
      },
      {
        header: "Orders",
        items: [{ label: "Orders", color: "#A989C5" }],
      },
    ]);
  });
});
