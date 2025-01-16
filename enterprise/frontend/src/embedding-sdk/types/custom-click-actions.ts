import type { RowValue } from "metabase-types/api";

export type MetabaseVisualizationClickEvent = MetabaseTableClickEvent;

export type MetabaseTableClickEvent = {
  type: "table";
  column?: MetabaseDatasetColumn;
  value?: RowValue;
  row?: Record<string, RowValue>;
};

export type MetabaseDatasetColumn = {
  id?: number;
  name: string;
  displayName: string;
};
