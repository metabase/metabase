/* @flow */

import type {ColumnName, DatasetData} from "metabase/meta/types/Dataset";
import type {ColumnMetadata} from "metabase/visualizations/components/settings/SummaryTableColumnsSetting";

export type Groups = [ColumnName];
export type Aggregations = [ColumnName];
export type AggregationKey = [Groups, Aggregations];

export type ValueSerialized = {
  groupsSources: string[],
  columnsSource: ?string,
  valuesSources: string[],
  columnNameToMetadata: { [key: ColumnName]: ColumnMetadata },
};


export type ResultProvider = AggregationKey => DatasetData;
