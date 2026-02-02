import * as ML from "cljs/metabase.lib.js";
import type { CardId, MeasureId } from "metabase-types/api";

import type {
  Bucket,
  CardMetadata,
  ColumnMetadata,
  FilterClause,
  MeasureMetadata,
  MetadataProvider,
  MetricDefinition,
  Projection,
  Query,
} from "./types";

/**
 * Create an empty MetricDefinition with the given metadata provider.
 */
export function metricDefinition(
  metadataProvider: MetadataProvider,
): MetricDefinition {
  return ML.metric_definition(metadataProvider);
}

/**
 * Set the metric definition source to a saved metric card.
 */
export function withMetricCard(
  definition: MetricDefinition,
  cardId: CardId,
  card: CardMetadata,
): MetricDefinition {
  return ML.with_metric_card(definition, cardId, card);
}

/**
 * Set the metric definition source to a measure (ad-hoc metric).
 */
export function withMeasure(
  definition: MetricDefinition,
  measureId: MeasureId,
  measure: MeasureMetadata,
): MetricDefinition {
  return ML.with_measure(definition, measureId, measure);
}

export type MetricDefinitionSourceType = "metric-card" | "measure";

export type MetricDefinitionSource =
  | { type: "metric-card"; cardId: CardId; card: CardMetadata }
  | { type: "measure"; measureId: MeasureId; measure: MeasureMetadata };

/**
 * Get the source configuration from a metric definition.
 * Returns null if no source has been set.
 */
export function metricDefinitionSource(
  definition: MetricDefinition,
): MetricDefinitionSource | null {
  return ML.metric_definition_source(definition);
}

/**
 * Get the source type: "metric-card", "measure", or null if no source set.
 */
export function metricDefinitionSourceType(
  definition: MetricDefinition,
): MetricDefinitionSourceType | null {
  return ML.metric_definition_source_type(definition);
}

/**
 * Build the base query for this metric definition.
 *
 * For metric-card: returns the card's query
 * For measure: builds a query from the measure's table with the measure as an aggregation
 */
export function metricDefinitionToBaseQuery(
  definition: MetricDefinition,
): Query | null {
  return ML.metric_definition_to_base_query(definition);
}

// --- Projections ---

/**
 * Get columns that can be used for breakouts from this metric definition's base query.
 * These are the columns available for projections.
 */
export function availableDimensions(
  definition: MetricDefinition,
): ColumnMetadata[] {
  return ML.available_dimensions(definition);
}

/**
 * Add a projection (dimension) to the metric definition.
 * The projection is a column with an optional temporal bucket that will become
 * a breakout when the query is built.
 */
export function addProjection(
  definition: MetricDefinition,
  column: ColumnMetadata,
  bucket: Bucket | null,
): MetricDefinition {
  return ML.add_projection(definition, column, bucket);
}

/**
 * Get the current projections from a metric definition.
 */
export function projections(definition: MetricDefinition): Projection[] {
  return ML.projections(definition);
}

/**
 * Remove all projections from a metric definition.
 */
export function clearProjections(definition: MetricDefinition): MetricDefinition {
  return ML.clear_projections(definition);
}

// --- Filters ---

/**
 * Add a filter clause to the metric definition.
 * The filter will be applied when the query is built.
 */
export function addFilter(
  definition: MetricDefinition,
  filterClause: FilterClause,
): MetricDefinition {
  return ML.add_filter(definition, filterClause);
}

/**
 * Get the current filters from a metric definition.
 */
export function metricDefinitionFilters(
  definition: MetricDefinition,
): FilterClause[] {
  return ML.metric_definition_filters(definition);
}

/**
 * Remove all filters from a metric definition.
 */
export function clearFilters(definition: MetricDefinition): MetricDefinition {
  return ML.clear_filters(definition);
}

// --- Query Building ---

/**
 * Build a complete query from the metric definition.
 *
 * This builds the base query and then applies:
 * 1. All projections as breakouts
 * 2. All filters
 *
 * Returns null if no source is set.
 */
export function metricDefinitionToQuery(
  definition: MetricDefinition,
): Query | null {
  return ML.metric_definition_to_query(definition);
}
