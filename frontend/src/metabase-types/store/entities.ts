import type {
  NormalizedCard,
  NormalizedCollection,
  NormalizedDashboard,
  NormalizedDatabase,
  NormalizedDocument,
  NormalizedField,
  NormalizedIndexedEntity,
  NormalizedMeasure,
  NormalizedNativeQuerySnippet,
  NormalizedSchema,
  NormalizedSegment,
  NormalizedTable,
  NormalizedWritebackAction,
} from "metabase-types/api";

export interface EntitiesState {
  actions: Record<string, NormalizedWritebackAction>;
  collections: Record<string, NormalizedCollection>;
  dashboards: Record<string, NormalizedDashboard>;
  documents: Record<string, NormalizedDocument>;
  databases: Record<string, NormalizedDatabase>;
  schemas: Record<string, NormalizedSchema>;
  tables: Record<string, NormalizedTable>;
  fields: Record<string, NormalizedField>;
  segments: Record<string, NormalizedSegment>;
  measures: Record<string, NormalizedMeasure>;
  indexedEntities: Record<string, NormalizedIndexedEntity>;
  snippets: Record<string, NormalizedNativeQuerySnippet>;
  questions: Record<string, NormalizedCard>;
}
