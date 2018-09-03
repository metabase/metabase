
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
  canTotalize,
  getAllAggregationKeysFlatten,
  getQueryPlan
} from "metabase/visualizations/lib/settings/summary_table";




export const getAggregationQueries = (visualizationSettings) => (card:Card, fields) => (
  query: DatasetQuery, parameters: Array<Parameter>
                        ) : DatasetQuery[] => {

  const settings : SummaryTableSettings = visualizationSettings[COLUMNS_SETTINGS];

  if(card.display !== SummaryTable.identifier || !isOk(settings))
    return [];

  // if(query.type === 'native')
  // {
  //   query = {
  //     type: "query",
  //     database: query.database,
  //     query: {
  //       source_table : 'card__' + card.id
  //     }
  //   };
  // }

  // if(query.query) {
  //   const fieldsNorm = fields instanceof Array ? fields.reduce((acc, p) => ({...acc, [p.id] : p}), {}) : fields;
  //   const metadata = {fields: fieldsNorm || {}};
  //   const filters = (parameters || []).map(datasetParameter => parameterToMBQLFilter(datasetParameter, metadata)).reduce((acc, p) => (acc && ['AND', acc, p]) || p, query.query.filter);
  //   query = {...query, query: {...query.query, filter: filters}};
  // }
  const nameToTypeMap = getNameToTypeMap(fields);

  const createLiteral = (name) => ['field-literal', name, nameToTypeMap[name]];
  const createTotal = (name) => ['named', ["sum", createLiteral(name)], name];

  const queryPlan = getQueryPlan(settings);
  const allKeys = getAllAggregationKeysFlatten(queryPlan, p => canTotalize(nameToTypeMap[p]));

  return allKeys.map(([groupings, aggregations]) =>
    ({ aggregation : aggregations.toArray().map(createTotal), breakout: groupings.toArray().map(createLiteral)}));
};

const getNameToTypeMap = (fields) => {
  return Object.keys(fields || {}).reduce((acc, value) => ({...acc, [fields[value].name]: fields[value].base_type}), {});
};

const buildQuery = (baseQuery : StructuredQuery, aggregations) : StructuredQuery =>{
  let res = baseQuery;
  aggregations.forEach(aggr => res = res.addAggregation(aggr));
  return res;
};

const isOk = (settings : SummaryTableSettings) : Boolean => {
  return settings
      && isOk2(settings.groupsSources)
      && isOk2(settings.valuesSources)
};

const isOk2 = (columns : string[]) : Boolean => {
  return columns &&  columns.length >=1;

};



