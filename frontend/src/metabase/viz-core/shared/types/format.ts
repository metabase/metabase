import type { DatasetColumn } from "metabase-types/api";

export type ColumnFormatter = (value: any, column: DatasetColumn) => string;
