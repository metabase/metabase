/* @flow */

import type {
  ColumnName,
  DatasetData,
  Column,
} from "metabase/meta/types/Dataset";
import type { ColumnMetadata } from "metabase/visualizations/components/settings/ChartSettingsSummaryTableColumns";
import { Set } from "immutable";

export const ASC = "asc";
export const DESC = "desc";

export type Groups = Set<ColumnName>;
export type Aggregations = Set<ColumnName>;
export type Order = ASC | DESC;
export type SortOrder = [Order, ColumnName];
export type AggregationKey = [Groups, Aggregations, SortOrder[]];

export type SummaryTableSettings = {
  groupsSources: string[],
  columnsSource: string[],
  valuesSources: string[],
  unusedColumns: string[],
  columnNameToMetadata: { [key: ColumnName]: ColumnMetadata },
};

export type ResultProvider = AggregationKey => DatasetData;

export type QueryPlan = {
  groupings: Groups[][],
  aggregations: Aggregations,
  sortOrder: SortOrder[],
};

export type ColumnHeader = {
  column: Column,
  columnSpan: Number,
  displayText?: string,
  value?: any,
};

export type SummaryTableDatasetData = {
  columnsHeaders: ColumnHeader[][],
} & DatasetData;
