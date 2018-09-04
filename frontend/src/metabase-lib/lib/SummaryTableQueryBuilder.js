
import * as Q from "metabase/lib/query/query";
import Query from './queries/Query';
import type {Parameter, ParameterValues} from "metabase/meta/types/Parameter";
import type {Card, DatasetQuery} from "metabase/meta/types/Card";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import SummaryTable, {
  COLUMNS_SETTINGS
} from "metabase/visualizations/visualizations/SummaryTable";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import {parameterToMBQLFilter} from "metabase/meta/Parameter";
import {updateIn} from "icepick";
import type {NativeQuery} from "metabase/meta/types/Query";
import {NativeDatasetQuery} from "metabase/meta/types/Card";
import type {DatabaseId} from "metabase/meta/types/Database";
import type {
  AggregationKey,
  SummaryTableSettings
} from "metabase/meta/types/summary_table";
import {
  canTotalizeByType,
  getAllAggregationKeysFlatten,
  getQueryPlan
} from "metabase/visualizations/lib/settings/summary_table";




export const getAggregationQueries = (visualizationSettings) => (card:Card, fields) : DatasetQuery[] => {

  const settings : SummaryTableSettings = visualizationSettings[COLUMNS_SETTINGS];

  if(card.display !== SummaryTable.identifier || !isOk(settings))
    return [];

  const nameToTypeMap = getNameToTypeMap(fields);

  const createLiteral = (name) => ['field-literal', name, nameToTypeMap[name]];
  const createTotal = (name) => ['named', ["sum", createLiteral(name)], name];

  const queryPlan = getQueryPlan(settings);
  const allKeys = getAllAggregationKeysFlatten(queryPlan, p => canTotalizeByType(nameToTypeMap[p]));

  return allKeys.map(([groupings, aggregations]) =>
    ({ aggregation : aggregations.toArray().map(createTotal), breakout: groupings.toArray().map(createLiteral)}));
};

const getNameToTypeMap = (fields) => {
  return Object.keys(fields || {}).reduce((acc, value) => ({...acc, [fields[value].name]: fields[value].base_type}), {});
};


const isOk = (settings : SummaryTableSettings) : Boolean => {
  return settings
      && isOk2(settings.groupsSources)
      && isOk2(settings.valuesSources)
};

const isOk2 = (columns : string[]) : Boolean => {
  return columns &&  columns.length >=1;

};



