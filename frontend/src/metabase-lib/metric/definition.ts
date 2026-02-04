import type {
  JsMetricDefinition,
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
