import type {
  JsMetricDefinition,
  MeasureId,
  MetricId,
} from "metabase-types/api";

import type {
  MeasureMetadata,
  MetadataProvider,
  MetricDefinition,
  MetricMetadata,
} from "./types";

export function fromMetricMetadata(
  _metadataProvider: MetadataProvider,
  _metricMetadata: MetricMetadata,
): MetricDefinition {
  throw new Error("Not implemented");
}

export function fromMeasureMetadata(
  _metadataProvider: MetadataProvider,
  _measureMetadata: MeasureMetadata,
): MetricDefinition {
  throw new Error("Not implemented");
}

export function fromJsDefinition(
  _jsDefinition: JsMetricDefinition,
): MetricDefinition {
  throw new Error("Not implemented");
}

export function toJsDefinition(
  _definition: MetricDefinition,
): JsMetricDefinition {
  throw new Error("Not implemented");
}

export function sourceMetricId(_definition: MetricDefinition): MetricId | null {
  throw new Error("Not implemented");
}

export function sourceMeasureId(
  _definition: MetricDefinition,
): MeasureId | null {
  throw new Error("Not implemented");
}
