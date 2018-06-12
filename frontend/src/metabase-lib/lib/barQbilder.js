
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
  const totals = visualization_settings[COLUMNS_SETTINGS][VALUES_SOURCES].map(p => resultFromBase[p]).filter(p => p[2] === 'type/Integer')
  console.log('gglaasad')
  console.log(resultFromBase);
  console.log(totals);

  const tmp = visualization_settings[COLUMNS_SETTINGS][GROUPS_SOURCES].map(p => ['field-id',resultFromBase[p]]); //Q.getBreakouts(card.dataset_query.query).map(p => [p, g.includes(fun(p))]).map(toParams).filter(p => p);
  const aggrs = totals.map(p => ["sum", ['field-id', p]]);// visualization_settings[COLUMNS_SETTINGS][VALUES_SOURCES].map()

  // Q.a
  console.log(tmp);
  console.log('gggg');

  let q1 = query;//.removeFilter(0);// query.cl Q.clearBreakouts(query);
  // q1 = Q.clearAggregations(q1);
  aggrs.forEach(aggr => q1 = q1.addAggregation(aggr));
  tmp.forEach(p => q1 = q1.addBreakout(p));
  // console.log('-------------');
  // console.log(Q.getBreakouts(q1));
  // const query = Q.add() .clearBreakouts(card.dataset_query.query);


  // const dataset_query = {...card.dataset_query, query : q1};
  // const res = new Question(meta, card, params).setDatasetQuery(card.dataset_query);// {datasetQuery: () => dataset_query};
  console.log('query before');
  console.log(query);
  console.log('query after');
  console.log(q1);
  console.log(card);

  // console.log(res);
  console.log('ggggggggg123')
  // const _datasetQuery = {};//..._datasetQuery, query : query._datasetQuery.query};
  // _datasetQuery.__proto__ = query._datasetQuery;
  // const qq = {...query};//, _datasetQuery: _datasetQuery};//, _datasetQuery};_datasetQuery
  // // qq.__proto__ = query;
  //
  // console.log(qq);
  // console.log(query);

  const datasetQuery = q1.datasetQuery();

  const query1 = new Question(metadata, {
    dataset_query: datasetQuery,
  }).query();

  return  [query1];//res
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
