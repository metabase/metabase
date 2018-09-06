import type { Card, DatasetQuery } from "metabase/meta/types/Card";
import SummaryTable, {
  COLUMNS_SETTINGS,
} from "metabase/visualizations/visualizations/SummaryTable";
import { updateIn } from "icepick";
import type { SummaryTableSettings } from "metabase/meta/types/summary_table";
import {
  canTotalizeByType,
  getAllAggregationKeysFlatten,
  getQueryPlan,
} from "metabase/visualizations/lib/settings/summary_table";

export const getAggregationQueries = visualizationSettings => (
  card: Card,
  fields,
): DatasetQuery[] => {
  const settings: SummaryTableSettings =
    visualizationSettings[COLUMNS_SETTINGS];

  if (card.display !== SummaryTable.identifier || !isOk(settings)) return [];

  const nameToTypeMap = getNameToTypeMap(fields);

  const createLiteral = name => ["field-literal", name, nameToTypeMap[name]];
  const createTotal = name => ["named", ["sum", createLiteral(name)], name];

  const queryPlan = getQueryPlan(settings);
  const allKeys = getAllAggregationKeysFlatten(queryPlan, p =>
    canTotalizeByType(nameToTypeMap[p]),
  );

  return allKeys.map(([groupings, aggregations]) => ({
    aggregation: aggregations.toArray().map(createTotal),
    breakout: groupings.toArray().map(createLiteral),
  }));
};

const getNameToTypeMap = fields => {
  return Object.keys(fields || {}).reduce(
    (acc, value) => ({ ...acc, [fields[value].name]: fields[value].base_type }),
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
