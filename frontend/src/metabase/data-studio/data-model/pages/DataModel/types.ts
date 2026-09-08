import type {
  DatabaseId,
  FieldId,
  SchemaId,
  SchemaName,
  TableId,
} from "metabase-types/api";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";

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
