import type { RowValue } from "metabase-types/api";

export type MetabaseVisualizationClickEvent = MetabaseTableClickEvent;

export type MetabaseTableClickEvent = {
  type: "table";
  column?: MetabaseDatasetColumn;
  value?: RowValue;
};

export type MetabaseDatasetColumn = {
  id?: number;
  name: string;
  displayName: string;
};
