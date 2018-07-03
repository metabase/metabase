
import * as Q from "metabase/lib/query/query";
import Query from './queries/Query';
import type {ParameterValues} from "metabase/meta/types/Parameter";
import type {Card} from "metabase/meta/types/Card";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import SummaryTable, {COLUMNS_SETTINGS} from "metabase/visualizations/visualizations/SummaryTable";
import StateSerialized, {GROUPS_SOURCES, VALUES_SOURCES, COLUMNS_SOURCE} from "metabase/visualizations/components/settings/SummaryTableColumnsSetting";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import {WrappedQuery} from "metabase-lib/lib/queries/WrappedQuery";


export const getAdditionalQueries = (visualizationSettings) => (card:Card, fields) => (
                           query: StructuredQuery,
                        ) : Card[] => {

  const settings : StateSerialized = visualizationSettings[COLUMNS_SETTINGS];

  if(card.display !== SummaryTable.identifier || !isOk(settings))
    return [];

  const nameToTypeMap = getNameToTypeMap(fields);

  if(!settings[GROUPS_SOURCES].every(p => nameToTypeMap[p])
    || !settings[VALUES_SOURCES].every(p => nameToTypeMap[p])
    || !settings[COLUMNS_SOURCE].every(p => nameToTypeMap[p])
  || !settings[VALUES_SOURCES].some(p => canTotalize(nameToTypeMap[p])))
    return [];

  const createLiteral = (name) => ['field-literal', name, nameToTypeMap[name]];
  const createTotal = (name) => ['named', ["sum", createLiteral(name)], name];
  const showTotalsFor = (name) => ((settings.columnNameToMetadata|| {})[name] || {}).showTotals;

  const totals = settings[VALUES_SOURCES].filter(p => canTotalize(nameToTypeMap[p])).map(createTotal);
  const breakouts = [...settings[GROUPS_SOURCES].map(createLiteral) ,...settings[COLUMNS_SOURCE].map(createLiteral)];

  // const basedQuery = );// buildQuery(query.clearBreakouts().clearAggregations(), totals);
  const queriesWithBreakouts = breakouts.reduce(({acc, prev}, br) => {
    const next = [... prev, br];
    const newAcc = showTotalsFor(br[1]) ? [ new WrappedQuery(query.question(), query.datasetQuery(), totals,prev), ...acc] : acc;
    return {acc : newAcc, prev:next};
  }, {acc:[], prev:[]});

// queriesWithBreakouts.acc
  return queriesWithBreakouts.acc.map(p => new Question({}, {
    dataset_query: p.datasetQuery(),
  }).query());
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
