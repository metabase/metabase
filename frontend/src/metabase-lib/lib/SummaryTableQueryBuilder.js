
import * as Q from "metabase/lib/query/query";
import Query from './queries/Query';
import type {Parameter, ParameterValues} from "metabase/meta/types/Parameter";
import type {Card, DatasetQuery} from "metabase/meta/types/Card";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import SummaryTable, {COLUMNS_SETTINGS} from "metabase/visualizations/visualizations/SummaryTable";
import StateSerialized, {GROUPS_SOURCES, VALUES_SOURCES, COLUMNS_SOURCE} from "metabase/visualizations/components/settings/SummaryTableColumnsSetting";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import {WrappedQuery, wrapQuery} from "metabase-lib/lib/queries/WrappedQuery";
import {parameterToMBQLFilter} from "metabase/meta/Parameter";
import {updateIn} from "icepick";
import type {NativeQuery} from "metabase/meta/types/Query";
import {NativeDatasetQuery} from "metabase/meta/types/Card";
import type {DatabaseId} from "metabase/meta/types/Database";


export const getAdditionalQueries = (visualizationSettings) => (card:Card, fields) => (
  query: DatasetQuery, parameters: Array<Parameter>
                        ) : DatasetQuery[] => {

  const settings : StateSerialized = visualizationSettings[COLUMNS_SETTINGS];

  if(card.display !== SummaryTable.identifier || !isOk(settings))
    return [];

  if(query.type === 'native')
  {
    query = {
      type: "query",
      database: query.database,
      query: {
        source_table : 'card__' + card.id
      }
    };
  }

  if(query.query) {
    const fieldsNorm = fields instanceof Array ? fields.reduce((acc, p) => ({...acc, [p.id] : p}), {}) : fields;
    const metadata = {fields: fieldsNorm || {}};
    const filters = (parameters || []).map(datasetParameter => parameterToMBQLFilter(datasetParameter, metadata)).reduce((acc, p) => (acc && ['AND', acc, p]) || p, query.query.filter);
    query = {...query, query: {...query.query, filter: filters}};
  }
  const nameToTypeMap = getNameToTypeMap(fields);

  const createLiteral = (name) => ['field-literal', name, nameToTypeMap[name]];
  const createTotal = (name) => ['named', ["sum", createLiteral(name)], name];
  const showTotalsFor = (name) => ((settings.columnNameToMetadata|| {})[name] || {}).showTotals;

  const totals = settings[VALUES_SOURCES].filter(p => canTotalize(nameToTypeMap[p])).map(createTotal);
  const groupingLiterals = settings[GROUPS_SOURCES].map(createLiteral);
  const pivotLiteral = settings[COLUMNS_SOURCE] && createLiteral(settings[COLUMNS_SOURCE]);
  const breakouts = pivotLiteral ? [ ... groupingLiterals, pivotLiteral] : [ ... groupingLiterals];
  const breakouts1 = [pivotLiteral, ... groupingLiterals];

  // const basedQuery = );// buildQuery(query.clearBreakouts().clearAggregations(), totals);
  const queriesWithBreakouts = breakouts.reduce(({acc, prev}, br) => {
    const next = [... prev, br];
    const newAcc = showTotalsFor(br[1]) ? [ wrapQuery(query, totals,prev), ...acc] : acc;
    return {acc : newAcc, prev:next};
  }, {acc:[], prev:[]});
  const totalsForPivot = pivotLiteral && showTotalsFor(pivotLiteral[1]) ? breakouts1.reduce(({acc, prev}, br) => {
    const next = [... prev, br];
    const newAcc = showTotalsFor(br[1]) ? [ wrapQuery(query, totals,prev), ...acc] : acc;
    return {acc : newAcc, prev:next};
  }, {acc:[], prev:[]}) : {acc:[]};
  //totalsForPivot last is grand total
  return [...queriesWithBreakouts.acc, ...totalsForPivot.acc];
};

const getNameToTypeMap = (fields) => {
  return Object.keys(fields || {}).reduce((acc, value) => ({...acc, [fields[value].name]: fields[value].base_type}), {});
};

const buildQuery = (baseQuery : StructuredQuery, aggregations) : StructuredQuery =>{
  let res = baseQuery;
  aggregations.forEach(aggr => res = res.addAggregation(aggr));
  return res;
};

const isOk = (settings : StateSerialized) : Boolean => {
  return settings
      && isOk2(settings[GROUPS_SOURCES])
      && isOk2(settings[VALUES_SOURCES])
};

const isOk2 = (columns : string[]) : Boolean => {
  return columns &&  columns.length >=1;

};


const canTotalize = (type : string) => type ==='type/Integer' || type === 'type/Float' || type === 'type/Decimal';
