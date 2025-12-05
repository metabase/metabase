import type { DataStudioTableMetadataTab } from "metabase/lib/urls/data-studio";
import type {
  DatabaseId,
  FieldId,
  SchemaId,
  SchemaName,
  TableId,
} from "metabase-types/api";

export type RouteParams = {
  databaseId?: string;
  schemaId?: SchemaId;
  tableId?: string;
  tab?: string;
  fieldId?: string;
};

export type ParsedRouteParams = {
  databaseId: DatabaseId | undefined;
  schemaName: SchemaName | undefined;
  tableId: TableId | undefined;
  tab: DataStudioTableMetadataTab;
  fieldId?: FieldId;
};

export type Column = "nav" | "table" | "field" | "preview";

export interface ColumnSizeConfig {
  flex: number | string;
  min: number;
  max: number | string;
}
