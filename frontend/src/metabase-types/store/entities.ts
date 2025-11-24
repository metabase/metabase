import type {
  NormalizedCard,
  NormalizedCollection,
  NormalizedDashboard,
  NormalizedDatabase,
  NormalizedDocument,
  NormalizedField,
  NormalizedIndexedEntity,
  NormalizedNativeQuerySnippet,
  NormalizedSchema,
  NormalizedSegment,
  NormalizedTable,
  NormalizedTableSymlink,
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
  indexedEntities: Record<string, NormalizedIndexedEntity>;
  tableSymlinks: Record<string, NormalizedTableSymlink>;
  snippets: Record<string, NormalizedNativeQuerySnippet>;
  questions: Record<string, NormalizedCard>;
}
