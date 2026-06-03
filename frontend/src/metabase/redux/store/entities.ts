import type {
  NormalizedCard,
  NormalizedCollection,
  NormalizedDashboard,
  NormalizedDatabase,
  NormalizedField,
  NormalizedMeasure,
  NormalizedMetric,
  NormalizedNativeQuerySnippet,
  NormalizedSchema,
  NormalizedSegment,
  NormalizedTable,
} from "metabase-types/api";

// backend returns model = "card" instead of "question"
export const entityTypeForModel = (model: string): string => {
  if (model === "card" || model === "dataset" || model === "metric") {
    return "questions";
  }
  return `${model}s`;
};

export const entityTypeForObject = (
  object?: { model: string } | null,
): string | undefined =>
  object ? entityTypeForModel(object.model) : undefined;

export interface EntitiesState {
  collections: Record<string, NormalizedCollection>;
  dashboards: Record<string, NormalizedDashboard>;
  databases: Record<string, NormalizedDatabase>;
  schemas: Record<string, NormalizedSchema>;
  tables: Record<string, NormalizedTable>;
  fields: Record<string, NormalizedField>;
  segments: Record<string, NormalizedSegment>;
  measures: Record<string, NormalizedMeasure>;
  metrics: Record<string, NormalizedMetric>;
  snippets: Record<string, NormalizedNativeQuerySnippet>;
  questions: Record<string, NormalizedCard>;
}
