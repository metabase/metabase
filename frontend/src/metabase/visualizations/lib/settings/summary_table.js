/* @flow */


import type {AggregationKey, QueryPlan, ResultProvider, SummaryTableSettings} from "metabase/meta/types/summary_table";
import type {ColumnName, DatasetData} from "metabase/meta/types/Dataset";
import {columnsAreValid} from "metabase/visualizations/lib/utils";
import get from 'lodash.get';
import set from 'lodash.set';
import zip from 'lodash.zip';
import isEqual from 'lodash.isequal';
import values from 'lodash.values';
import invert from 'lodash.invert';
import flatMap from 'lodash.flatmap';
import _ from 'lodash';
import {Set} from 'immutable';


const AGGREGATION = "aggregation";
const BREAKOUT = "breakout";

export const settingsAreValid = (settings: SummaryTableSettings, data: DatasetData) =>
  settings && columnsAreValid(getColumnsFromSettings(settings), data);

export const getColumnsFromSettings = (value: SummaryTableSettings) =>
  [...value.groupsSources, ... [value.columnsSource].filter(p => p), ...value.valuesSources];

export const createKey = (groups:ColumnName[], totals: ColumnName[]) : AggregationKey => [Set.of(...groups), Set.of(...totals)];

const getColumnNames = (dataSet : DatasetData, source: string) => dataSet.cols.filter(p => p.source === source).map(p => p.name);

const createKeyFrom = (dataSet : DatasetData) => createKey(getColumnNames(dataSet,BREAKOUT ), getColumnNames(dataSet, AGGREGATION));


const createValueKey = (groups: ColumnName[]) : string => groups.reduce((acc, k) => acc.length < k.length? k : acc, '') + '_42';

export const mainKey : AggregationKey = [Set.of(), Set.of()];


const resultsBuilder = ({cols, columns, rows}: DatasetData) => ([groupings, totals]: AggregationKey) : DatasetData =>{
  const groupingColumns = cols.filter(col => groupings.has(col.name)).map(p => ({...p, source : BREAKOUT}));
  const totalsColumns = cols.filter(col => totals.has(col.name)).map(p => ({...p, source: AGGREGATION}));


  const columnToIndex = invert(columns);


  const groupingIndexes = groupingColumns.map(col => columnToIndex[col.name]);
  const totalsIndexes = totalsColumns.map(col => columnToIndex[col.name]);

  const rowResRaw = rows.reduce((acc, row) => {
    const rowPrefix = groupingIndexes.map(i => row[i]);
    const path = rowPrefix.toString();

    const values = acc[path] || [];


    const oldIndex = values.findIndex(([prefix, totals]) => isEqual(prefix, rowPrefix));
    const newIndex = oldIndex === -1 ? values.length : oldIndex;

    const oldTotals = get(values, [newIndex, 1], []);
    const toAdd = totalsIndexes.map(i => row[i]);

    const newTotals = zip(oldTotals, toAdd).map(([n1, n2]) => (n1 || n2) && (n1 || 0) + (n2 || 0));

    values[newIndex] = [rowPrefix, newTotals];
    acc[path] = values;

    return acc;
  }, {});

  const newRows = flatMap(values(rowResRaw), p => p.map(([pref,suff]) => [...pref, ...suff]));

  const colsRes = [...groupingColumns, ...totalsColumns];
  const res = { cols : colsRes, columns: _.orderBy(colsRes.map(p => p.name), p => columnToIndex[p]), rows : newRows};

  return res;
};

const canBuildResultsBuilder = (mainResult: DatasetData) : (AggregationKey => boolean) =>{
  const canBuildTotals = isSuperset(mainResult.columns);
  const canBuildGroups = isSuperset(mainResult.columns);
  return ([groupings, totals]) => canBuildGroups(groupings) &&  canBuildTotals(totals);
};

const isSuperset = (subsetValues: ColumnName[]) => (superSet : Set<ColumnName>) => superSet.subtract(subsetValues).size === 0;

export const buildResultProvider = (mainResult: DatasetData, totalsSeries: DatasetData[]) : ResultProvider =>{

  const totalsWithKeys = (totalsSeries || []).map(p => [p, createKeyFrom(p)]);

  const valueKey = createValueKey(mainResult.columns);

  const totalsLookupTree = totalsWithKeys.reduce((acc, [elem, [gr, unused]]) => set(acc, [...gr, valueKey], elem) , {});

  const canBuildResults = canBuildResultsBuilder(mainResult);
  //all results from totalsSeries should have the same aggregations
  const canBeInCache = isSuperset(get(totalsSeries, [0,1], mainKey)[1]);

  const buildResultsFor = resultsBuilder(mainResult);


  return (key : AggregationKey) : DatasetData => {

    if(mainKey === key)
      return mainResult;

    const [groups,aggregations] = key;


    if(canBuildResults(key))
      return canBeInCache(aggregations) && get(totalsLookupTree, [...groups, valueKey]) || buildResultsFor(key);


    throw new Error("InvalidArgumentException - BANG!!!!" + key + '    ' + key[0].subtract(mainResult.columns).size + '  ' + key[0].size);
  };
};

const emptyQueryPlan : QueryPlan = {groupings : [], aggregations : Set.of()};

export const getQueryPlan = (settings: SummaryTableSettings, canTotalize: ColumnName => boolean = () => true) : QueryPlan =>{
  const aggregations = Set.of(...settings.valuesSources.filter(canTotalize));

  if(aggregations.size === 0)
    return emptyQueryPlan;

  const showTotalsFor = name => (settings.columnNameToMetadata[name] || {}).showTotals;
  const allBreakouts = [...[settings.columnsSource].filter(p => p), ... settings.groupsSources];

  if(!allBreakouts.find(showTotalsFor))
    return emptyQueryPlan;

  const queriesBreakouts = allBreakouts.reduce(({acc, prev}, br) => {
    const next = prev.add(br);
    const newAcc = showTotalsFor(br) ? [prev, ...acc] : acc;
    return {acc : newAcc, prev:next};
  }, {acc:[], prev: Set.of()});

  if(!showTotalsFor(settings.columnsSource))
    return {groupings: queriesBreakouts.acc.map(p => [p]), aggregations};

  const groupings = queriesBreakouts.acc.splice(0, queriesBreakouts.acc.length -1).map(p => [p, p.remove(settings.columnsSource)]);


  return {
    mainQueryTotalColumn : Set.of(...settings.groupsSources),
    groupings,
    aggregations
  };
};

const getAllAggregationKeysRaw = (qp : QueryPlan, totalValueFilter: ColumnName => boolean) :{mainQueryColumn?: AggregationKey,  totals: AggregationKey[][]} =>{
  const aggregations = qp.aggregations.filter(totalValueFilter);

  return {mainQueryColumn:  qp.mainQueryTotalColumn && createKey(qp.mainQueryTotalColumn, aggregations),
    totals: qp.groupings.map(group => group.map(p => createKey(p, aggregations)))};
};


export const getAllQueryKeys = (qp : QueryPlan, totalValueFilter: ColumnName => boolean) :AggregationKey[][] =>{
  const {mainQueryColumn, totals} = getAllAggregationKeysRaw(qp, totalValueFilter);
  return [[mainKey, mainQueryColumn].filter(p => p), ...totals];
};

export const getAllAggregationKeysFlatten = (qp : QueryPlan, totalValueFilter: ColumnName => boolean) :AggregationKey[][] =>{
  const {mainQueryColumn, totals} = getAllAggregationKeysRaw(qp, totalValueFilter);
  if(!mainQueryColumn)
    return flatMap(totals);

  return [mainQueryColumn,...flatMap(totals)];
};

export const canTotalize = (type : string) => type ==='type/Integer' || type === 'type/Float' || type === 'type/Decimal';
