import type {
  MeasureId,
  MetricId,
  NormalizedMeasure,
  NormalizedMetric,
} from "metabase-types/api";

declare const _MetadataProviderSymbol: unique symbol;
declare const _MetricMetadataSymbol: unique symbol;
declare const _MeasureMetadataSymbol: unique symbol;
declare const _MetricDefinitionSymbol: unique symbol;
declare const _JsMetricDefinitionSymbol: unique symbol;
declare const _DimensionMetadataSymbol: unique symbol;
declare const _FilterClauseSymbol: unique symbol;
declare const _ProjectionClauseSymbol: unique symbol;
declare const _TemporalBucketSymbol: unique symbol;
declare const _BinningStrategySymbol: unique symbol;

export type MetadataProvider = unknown & {
  _opaque: typeof _MetadataProviderSymbol;
};

export type MetricMetadata = unknown & {
  _opaque: typeof _MetricMetadataSymbol;
};

export type MeasureMetadata = unknown & {
  _opaque: typeof _MeasureMetadataSymbol;
};

export type MetricDefinition = unknown & {
  _opaque: typeof _MetricDefinitionSymbol;
};

export type JsMetricDefinition = unknown & {
  _opaque: typeof _JsMetricDefinitionSymbol;
};

export type DimensionMetadata = unknown & {
  _opaque: typeof _DimensionMetadataSymbol;
};

export type FilterClause = unknown & {
  _opaque: typeof _FilterClauseSymbol;
};

export type ProjectionClause = unknown & {
  _opaque: typeof _ProjectionClauseSymbol;
};

export type TemporalBucket = unknown & {
  _opaque: typeof _TemporalBucketSymbol;
};

export type BinningStrategy = unknown & {
  _opaque: typeof _BinningStrategySymbol;
};

export type MetricSource = MetricMetadata | MeasureMetadata;

export type JsMetadataProvider = {
  measures?: Record<MeasureId, NormalizedMeasure>;
  metrics?: Record<MetricId, NormalizedMetric>;
};
