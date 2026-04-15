import * as LibMetric from "metabase-lib/metric";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import Metric from "metabase-lib/v1/metadata/Metric";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SourceBreakoutColorMap,
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

    const definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry> = {
      "metric:1": { id: "metric:1", definition },
    };
    const activeBreakoutColors: SourceBreakoutColorMap = {
      0: "#509EE3",
    };

    const formulaEntities: MetricDefinitionEntry[] = [
      { id: "metric:1", type: "metric", definition: null },
    ];

    expect(
      buildLegendGroups(formulaEntities, definitions, activeBreakoutColors),
    ).toEqual([]);
  });

  it("returns empty array when activeBreakoutColors has only string values", () => {
    const metadata = createMetadata([REVENUE_METRIC]);
    const definition = setupDefinitionWithBreakout(
      metadata,
      REVENUE_METRIC.id,
      1,
    );

    const definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry> = {
      "metric:1": { id: "metric:1", definition },
    };
    const activeBreakoutColors: SourceBreakoutColorMap = {
      0: "#509EE3",
    };

    const formulaEntities: MetricDefinitionEntry[] = [
      { id: "metric:1", type: "metric", definition: null },
    ];

    expect(
      buildLegendGroups(formulaEntities, definitions, activeBreakoutColors),
    ).toEqual([]);
  });

  it("builds legend groups for definitions with and without breakouts", () => {
    const metadata = createMetadata([REVENUE_METRIC, ORDERS_METRIC]);
    const revenueDefinition = setupDefinitionWithBreakout(
      metadata,
      REVENUE_METRIC.id,
      1,
    );
    const ordersDefinition = setupDefinition(metadata, ORDERS_METRIC.id);

    const definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry> = {
      "metric:1": { id: "metric:1", definition: revenueDefinition },
      "metric:2": { id: "metric:2", definition: ordersDefinition },
    };

    const formulaEntities: MetricDefinitionEntry[] = [
      {
        id: "metric:1",
        type: "metric",
        definition: revenueDefinition,
      },
      { id: "metric:2", type: "metric", definition: null },
    ];

    const activeBreakoutColors: SourceBreakoutColorMap = {
      0: new Map([
        ["Gadgets", "#509EE3"],
        ["Widgets", "#88BF4D"],
      ]),
      1: "#A989C5",
    };

    expect(
      buildLegendGroups(formulaEntities, definitions, activeBreakoutColors),
    ).toEqual([
      {
        key: 0,
        header: "Category",
        subtitle: "Revenue",
        items: [
          { label: "Gadgets", color: "#509EE3" },
          { label: "Widgets", color: "#88BF4D" },
        ],
      },
      {
        key: 1,
        header: "Orders",
        items: [{ label: "Orders", color: "#A989C5" }],
      },
    ]);
  });
});
