import type {
  DatabaseId,
  SchemaName,
  Table,
  TableId,
} from "metabase-types/api";

export type SuggestedTableRow = {
  id: TableId;
  table: Table;
  databaseName: string;
  schemaName: string;
};

export type SuggestedTablesFilters = {
  databaseId: DatabaseId | null;
  schemaName: SchemaName | null;
};
