import type { DatasetColumn } from "metabase-types/api";

export type ValueFormatter = (value: any) => string;

export type ColumnFormatter = (value: any, column: DatasetColumn) => string;

export type ChartTicksFormatters = {
  xTickFormatter: ValueFormatter;
  yTickFormatter: ValueFormatter;
};
