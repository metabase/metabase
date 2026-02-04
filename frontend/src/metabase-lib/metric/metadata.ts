import type { MeasureId, MetricId } from "metabase-types/api";

import type {
  JsMetadataProvider,
  MeasureMetadata,
  MetadataProvider,
  MetricMetadata,
} from "./types";

export function metadataProvider(
  _jsMetadata: JsMetadataProvider,
): MetadataProvider {
  throw new Error("Not implemented");
}

export function metricMetadata(
  _metadataProvider: MetadataProvider,
  _metricId: MetricId,
): MetricMetadata | null {
  throw new Error("Not implemented");
}

export function measureMetadata(
  _metadataProvider: MetadataProvider,
  _measureId: MeasureId,
): MeasureMetadata | null {
  throw new Error("Not implemented");
}
