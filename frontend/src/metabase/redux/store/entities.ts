import type {
  NormalizedCard,
  NormalizedDatabase,
  NormalizedField,
  NormalizedMeasure,
  NormalizedMetric,
  NormalizedNativeQuerySnippet,
  NormalizedSchema,
  NormalizedSegment,
  NormalizedTable,
} from "metabase-types/api";

export interface EntitiesState {
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
