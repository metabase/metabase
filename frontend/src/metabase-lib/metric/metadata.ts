import type { MeasureId, MetricId } from "metabase-types/api";

import type {
  BinningStrategy,
  BinningStrategyDisplayInfo,
  Clause,
  ClauseDisplayInfo,
  DimensionDisplayInfo,
  DimensionMetadata,
  JsMetadataProvider,
  MeasureDisplayInfo,
  MeasureMetadata,
  MetadataProvider,
  MetricDefinition,
  MetricDisplayInfo,
  MetricMetadata,
  TemporalBucket,
  TemporalBucketDisplayInfo,
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

declare function _DisplayInfoFn(
  _definition: MetricDefinition,
  _source: MetricMetadata,
): MetricDisplayInfo;
declare function _DisplayInfoFn(
  _definition: MetricDefinition,
  _source: MeasureMetadata,
): MeasureDisplayInfo;
declare function _DisplayInfoFn(
  _definition: MetricDefinition,
  _source: Clause,
): ClauseDisplayInfo;
declare function _DisplayInfoFn(
  _definition: MetricDefinition,
  _source: DimensionMetadata,
): DimensionDisplayInfo;
declare function _DisplayInfoFn(
  _definition: MetricDefinition,
  _source: TemporalBucket,
): TemporalBucketDisplayInfo;
declare function _DisplayInfoFn(
  _definition: MetricDefinition,
  _source: BinningStrategy,
): BinningStrategyDisplayInfo;

export const displayInfo: typeof _DisplayInfoFn = () => {
  throw new Error("Not implemented");
};
