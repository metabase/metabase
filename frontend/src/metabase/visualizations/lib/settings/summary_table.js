/* @flow */


import type {AggregationKey, ResultProvider, ValueSerialized} from "metabase/meta/types/summary_table";
import type {ColumnName, DatasetData} from "metabase/meta/types/Dataset";
import {columnsAreValid} from "metabase/visualizations/lib/utils";
import get from 'lodash.get';
import set from 'lodash.set';
import _ from 'lodash';


export const settingsAreValid = (settings: ValueSerialized, data: DatasetData) =>
  settings && columnsAreValid(getColumnsFromSettings(settings), data);

export const getColumnsFromSettings = (value: ValueSerialized) =>
  [...value.groupsSources, ... [value.columnsSource].filter(p => p), ...value.valuesSources];

export const createKey = (groups:ColumnName[], totals: ColumnName[]) : AggregationKey => [_.orderBy(groups), _.orderBy(totals)];

const getColumnNames = (dataSet : DatasetData, source: string) => dataSet.cols.filter(p => p.source === source).map(p => p.name);

const createKeyFrom = (dataSet : DatasetData) => createKey(getColumnNames(dataSet, "breakout"), getColumnNames(dataSet,"aggregation"));


const createValueKey = (groups: ColumnName[]) : string => groups.reduce((acc, k) => acc.length < k.length? k : acc, '') + '_42';


export const buildResultProvider = (mainResult: DatasetData, totalsSeries: DatasetData[]) : ResultProvider =>{

  if(!totalsSeries || totalsSeries.length === 0)
    return () => undefined;

  const totalsWithKeys = totalsSeries.map(p => [p, createKeyFrom(p)]);

  const [unused, aggr] = totalsWithKeys[0][1];
  const valueKey = createValueKey(mainResult.columns);


  const totalsLookupTree = totalsWithKeys.reduce((acc, [elem, [gr, unused]]) => set(acc, [...gr, valueKey], elem) , {});


  return ([groups,aggregations] : AggregationKey) : DatasetData => {
    if(aggregations !== aggr)
      return undefined;

    return get([...totalsLookupTree, valueKey], groups);
  }
};

