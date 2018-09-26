import type { DatasetQuery } from "metabase/meta/types/Card";
import type { Column } from "metabase/meta/types/Dataset";
import type { SummaryTableSettings } from "metabase/meta/types/summary_table";
import {
  canTotalizeByType,
  getAllAggregationKeysFlatten,
  getQueryPlan,
} from "metabase/visualizations/lib/settings/summary_table";

export const getAggregationQueries = (settings : SummaryTableSettings,  cols : Column[]): DatasetQuery[] => {

  const nameToTypeMap = getNameToTypeMap(cols);

  const createLiteral = name => ["field-literal", name, nameToTypeMap[name]];
  const createTotal = name => ["named", ["sum", createLiteral(name)], name];

  const queryPlan = getQueryPlan(settings, p =>
    canTotalizeByType(nameToTypeMap[p]));
  const allKeys = getAllAggregationKeysFlatten(queryPlan);

  return allKeys.map(([groupings, aggregations]) => ({
    aggregation: aggregations.toArray().map(createTotal),
    breakout: groupings.toArray().map(createLiteral),
  }));
};

const getNameToTypeMap = columns => {
  return columns.reduce(
    (acc, column) => ({ ...acc, [column.name]: column.base_type }),
    {},
  );
};

const isOk = (settings: SummaryTableSettings): Boolean => {
  return (
    settings && isOk2(settings.groupsSources) && isOk2(settings.valuesSources)
  );
};

const isOk2 = (columns: string[]): Boolean => {
  return columns && columns.length >= 1;
};
