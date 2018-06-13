
import * as Q from "metabase/lib/query/query";
import Card from "metabase/components/Card";
import Query from './queries/Query';
import type {ParameterValues} from "metabase/meta/types/Parameter";
import type {Card as CardObject} from "metabase/meta/types/Card";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import SummaryTable, {COLUMNS_SETTINGS} from "metabase/visualizations/visualizations/SummaryTable";
import {GROUPS_SOURCES, VALUES_SOURCES} from "metabase/visualizations/components/settings/SummaryTableColumnsSetting";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";


export const getFoo = (visualization_settings) => (card:Card, metadata, question) => (
                           query: StructuredQuery,
                        ) : Card[] => {

  console.log('question uuuuuuuuuuuuu')
  console.log(question);

  const gggggg = card.result_metadata || Object.getOwnPropertyNames(metadata.fields).filter(p => p.startsWith('field-literal')).map(p => metadata.fields[p]);
  console.log(gggggg);

  console.log('ffasdas' + (card.display !== SummaryTable.identifier || !isOk(visualization_settings) ))
  console.log(card);
console.log(metadata);

  if(card.display !== SummaryTable.identifier || !isOk(visualization_settings)  || !(query instanceof StructuredQuery))
    return [];

  const resultFromBase = gggggg.reduce((acc, elem) => ({...acc, [elem.name]: createFieldInfo(elem)}), {});
  const totals = visualization_settings[COLUMNS_SETTINGS][VALUES_SOURCES].map(p => resultFromBase[p]).filter(p => p[2] === 'type/Integer' || p[2] === 'type/Float')
  console.log('gglaasad')
  console.log(resultFromBase);
  console.log(totals);

  const tmp = visualization_settings[COLUMNS_SETTINGS][GROUPS_SOURCES].map(p => ['field-id',resultFromBase[p]]); //Q.getBreakouts(card.dataset_query.query).map(p => [p, g.includes(fun(p))]).map(toParams).filter(p => p);
  const aggrs = totals.map(p => ['named', ["sum", ['field-id', p]], p[1]]);// visualization_settings[COLUMNS_SETTINGS][VALUES_SOURCES].map()

  // Q.a
  console.log(tmp);
  console.log('gggg');

  const basedQuery = buildQuery(query, aggrs);
  const queriesWithBreakouts = tmp.reduce(({acc, prev}, br) => {
    const next = prev.addBreakout(br);
    return {acc :[prev, ...acc], prev:next};
  }, {acc:[], prev:basedQuery});


  return queriesWithBreakouts.acc.map(p => new Question(metadata, {
    dataset_query: p.datasetQuery(),
  }).query());
};

const buildQuery = (baseQuery : StructuredQuery, aggregations) : StructuredQuery =>{
  let res = baseQuery;
  aggregations.forEach(aggr => res = res.addAggregation(aggr));
  return res;
};

const isOk = (visualization_settings) : Boolean => {
  return visualization_settings
    && visualization_settings[COLUMNS_SETTINGS]
      && isOk2(visualization_settings[COLUMNS_SETTINGS][GROUPS_SOURCES])
      && isOk2(visualization_settings[COLUMNS_SETTINGS][VALUES_SOURCES])

};

const isOk2 = (columns : string[]) : Boolean => {
  return columns &&  columns.length >=1;

};

const fieldToName = (metadata : Metadata) => (arr ) =>{
  if(arr.length === 2 && arr[0] === 'field-id'){
      return metadata.field(arr[1]).name;
  }
  //
  return '';
}

const toParams = ([param, aaa]) =>{
  if(aaa)
    return param;
  return null;
}


const createFieldInfo = ({base_type, name}) : string[] =>{
  return ['field-literal', name, base_type];
};
