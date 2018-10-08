
import type {
  AggregationKey,
  QueryPlan,
  ResultProvider,
  SummaryTableSettings,
} from "metabase/meta/types/summary_table";
import type { ColumnName, DatasetData } from "metabase/meta/types/Dataset";
import { columnsAreValid } from "metabase/visualizations/lib/utils";
import get from "lodash.get";
import set from "lodash.set";
import zip from "lodash.zip";
import isEqual from "lodash.isequal";
import values from "lodash.values";
import invert from "lodash.invert";
import flatMap from "lodash.flatmap";
import partition from "lodash.partition";
import _ from "lodash";
import { Set } from "immutable";
import { emptyColumnMetadata } from "metabase/visualizations/components/settings/ChartSettingsSummaryTableColumns";
import {getAggregationQueries} from "metabase-lib/lib/SummaryTableQueryBuilder";
import {
  fetchDataOrError, getDashboardType
} from "metabase/dashboard/dashboard";
import {CardApi, EmbedApi, MetabaseApi, PublicApi} from "metabase/services";
import {getParametersBySlug} from "metabase/meta/Parameter";
import {getDashboardComplete} from "metabase/dashboard/selectors";
import {applyParameters} from "metabase/meta/Card";

const AGGREGATION = "aggregation";
const BREAKOUT = "breakout";

export const settingsAreValid = (
  settings: SummaryTableSettings,
  data: DatasetData,
) =>
  settings &&
  columnsAreValid(getColumnsFromSettings(settings), data) &&
  settings.columnsSource.length <= 1;

export const getColumnsFromSettings = (value: SummaryTableSettings) => [
  ...value.groupsSources,
  ...value.columnsSource,
  ...value.valuesSources,
];

export const createKey = (
  groups: ColumnName[],
  totals: ColumnName[],
): AggregationKey => [Set.of(...groups), Set.of(...totals)];

const getColumnNames = (dataSet: DatasetData, source: string) =>
  dataSet.cols.filter(p => p.source === source).map(p => p.name);

const createKeyFrom = (dataSet: DatasetData) =>
  createKey(
    getColumnNames(dataSet, BREAKOUT),
    getColumnNames(dataSet, AGGREGATION),
  );

const createValueKey = (groups: ColumnName[]): string =>
  groups.reduce((acc, k) => (acc.length < k.length ? k : acc), "") + "_42";


const resultsBuilder = ({ cols, columns, rows }: DatasetData) => ([
  groupings,
  totals,
]: AggregationKey): DatasetData => {
  const groupingColumns = cols
    .filter(col => groupings.has(col.name))
    .map(p => ({ ...p, source: BREAKOUT }));
  const totalsColumns = cols
    .filter(col => totals.has(col.name))
    .map(p => ({ ...p, source: AGGREGATION }));

  const columnToIndex = invert(columns);

  const groupingIndexes = groupingColumns.map(col => columnToIndex[col.name]);
  const totalsIndexes = totalsColumns.map(col => columnToIndex[col.name]);

  const rowResRaw = rows.reduce((acc, row) => {
    const rowPrefix = groupingIndexes.map(i => row[i]);
    const path = rowPrefix.toString();

    const values = acc[path] || [];

    const oldIndex = values.findIndex(([prefix, totals]) =>
      isEqual(prefix, rowPrefix),
    );
    const newIndex = oldIndex === -1 ? values.length : oldIndex;

    const oldTotals = get(values, [newIndex, 1], []);
    const toAdd = totalsIndexes.map(i => row[i]);

    const newTotals = zip(oldTotals, toAdd).map(
      ([n1, n2]) => (n1 || n2) && (n1 || 0) + (n2 || 0),
    );

    values[newIndex] = [rowPrefix, newTotals];
    acc[path] = values;

    return acc;
  }, {});

  const newRows = flatMap(values(rowResRaw), p =>
    p.map(([pref, suff]) => [...pref, ...suff]),
  );

  const colsRes = [...groupingColumns, ...totalsColumns];
  const res = {
    cols: colsRes,
    columns: _.orderBy(colsRes.map(p => p.name), p => columnToIndex[p]),
    rows: newRows,
  };

  return res;
};

const canBuildResultsBuilder = (
  mainResult: DatasetData,
): (AggregationKey => boolean) => {
  const canBuildTotals = isSuperset(mainResult.columns);
  const canBuildGroups = isSuperset(mainResult.columns);
  return ([groupings, totals]) =>
    canBuildGroups(groupings) && canBuildTotals(totals);
};

const isSuperset = (subsetValues: ColumnName[]) => (
  superSet: Set<ColumnName>,
) => superSet.subtract(subsetValues).size === 0;

export const buildResultProvider = (
  rawResults: DatasetData,
  totalsSeries: DatasetData[],
): ResultProvider => {
  const totalsWithKeys = (totalsSeries || []).map(p => [p, createKeyFrom(p)]);

  const valueKey = createValueKey(rawResults.columns);

  const totalsLookupTree = totalsWithKeys.reduce(
    (acc, [elem, [gr, unused]]) => set(acc, [...gr, valueKey], elem),
    {},
  );

  const canBuildResults = canBuildResultsBuilder(rawResults);
  //all results from totalsSeries should have the same aggregations
  const canBeInCache = isSuperset(get(totalsWithKeys, [0, 1])[1]);

  const buildResultsFor = resultsBuilder(rawResults);

  return (key: AggregationKey): DatasetData => {

    const [groups, aggregations] = key;

    if (canBuildResults(key)) {
      return (
        (canBeInCache(aggregations) &&
          get(totalsLookupTree, [...groups, valueKey])) ||
        buildResultsFor(key)
      );
    }

    throw new Error("InvalidArgumentException - BANG!!!!");
  };
};

export const getMainKey = (qp : QueryPlan) => createKey(qp.groupings[0].reduce((acc, current) => acc.size < current.size ? current : acc, Set.of()), qp.aggregations);

export const getQueryPlan = (
  settings: SummaryTableSettings,
  canTotalize: ColumnName => boolean,
): QueryPlan => {
  const [aggregationsList, additionalGroupings] = partition(settings.valuesSources, canTotalize);
  const aggregations = Set.of(...aggregationsList);
  const subqueriesBreakouts = [...settings.columnsSource, ...settings.groupsSources];
  const allBreakouts = Set.of(...subqueriesBreakouts, ...additionalGroupings);


  if (aggregations.size === 0) {
    return {groupings: [[allBreakouts]], aggregations: Set.of() };
  }

  const showTotalsFor = name =>
    (settings.columnNameToMetadata[name] || {}).showTotals;


  const queriesBreakouts = subqueriesBreakouts.reduce(
    ({ acc, prev }, br) => {
      const next = prev.add(br);

      const newAcc = showTotalsFor(br) ? [prev, ...acc] : acc;
      return { acc: newAcc, prev: next };
    },
    { acc: [], prev: Set.of() },
  );

  const breakoutsList = [allBreakouts, ...queriesBreakouts.acc];

  if (!showTotalsFor(settings.columnsSource[0])) {
    return { groupings: breakoutsList.map(p => [p]), aggregations };
  }

  const groupings = breakoutsList
    .slice(0, breakoutsList.length-1)
    .map(p => [p, p.filter(p => !settings.columnsSource.includes(p) && !additionalGroupings.includes(p))]);

  return {
    groupings,
    aggregations,
  };
};
//todo: move into QueryPlan object
export const getAllQueryKeys = (
  qp: QueryPlan
): { totals: AggregationKey[][] } => {
  const aggregations = qp.aggregations;

  return  qp.groupings.map(group =>
      group.map(p => createKey(p, aggregations)));
};

export const getAllAggregationKeysFlatten = (
  qp: QueryPlan
): AggregationKey[][] => flatMap(getAllQueryKeys(qp));


export const canTotalizeByType = (type: string) =>
  type === "type/BigInteger" ||
  type === "type/Integer" ||
  type === "type/Float" ||
  type === "type/Decimal";

const shouldTotalizeDefaultBuilder = (
  columns: Column[],
): (ColumnName => boolean) => {
  const aggrColumns =
    columns[0].source === "fields" ||
    !columns[0].source ||
    columns.filter(p => p.source !== BREAKOUT).length === 0
      ? columns
          .filter(p => !p.special_type)
          .filter(p => canTotalizeByType(p.base_type))
      : columns.filter(p => p.source === AGGREGATION);

  const aggregations = Set.of(...aggrColumns.map(p => p.name));
  return name => aggregations.has(name);
};

const emptyStateSerialized: SummaryTableSettings = {
  groupsSources: [],
  columnsSource: [],
  valuesSources: [],
  unusedColumns: [],
  columnNameToMetadata: {},
};


const getMetadataBuilder = (columnNameToMetadata, sortOverride) =>{
  return columnName => {
    const metadata = columnNameToMetadata[columnName] || emptyColumnMetadata;
    const orderOverridden = sortOverride[columnName];
    if(orderOverridden && orderOverridden !== (metadata.isAscSortOrder ? 'asc' : 'desc'))
      return {...metadata, isAscSortOrder: !metadata.isAscSortOrder};


    return metadata;
  }
};


const enrichColumns = ({ columnsSource,
                         groupsSources,
                         valuesSources,
                         unusedColumns,
                       }, cols, columns) => {

  const usedColumns = Set.of(
    ...columnsSource,
    ...groupsSources,
    ...valuesSources,
    ...unusedColumns,
  );
  const newColumns = columns.filter(p => !usedColumns.has(p));
  const unusedColumnsNew = unusedColumns.filter(p => columns.includes(p));

  const shouldTotal = shouldTotalizeDefaultBuilder(cols);

  const groupsSourcesNew = newColumns.filter(p => !shouldTotal(p));
  const valuesSourcesNew = newColumns.filter(shouldTotal);

  return {
    groupsSources: [...groupsSources, ...groupsSourcesNew],
    columnsSource,
    valuesSources: [...valuesSources, ...valuesSourcesNew],
    unusedColumns: unusedColumnsNew,
  };
};

const enrichMetadata = ({groupsSources, columnsSource}, columnNameToMetadata, sortOverride) => {
  const fatColumns = [...groupsSources, ...columnsSource];
  const getMetadata = getMetadataBuilder(columnNameToMetadata, sortOverride);
  return fatColumns.reduce(
    (acc, column) => ({
      ...acc,
      [column]: getMetadata(column) ,
    }),
    {},
  );

};

export const enrichSettings = (
  stateSerialized,
  cols,
  columns,
  sortOverride = {}
): SummaryTableSettings => {

  const stateNormalized = { ...emptyStateSerialized, ...stateSerialized };

  const partColumns = enrichColumns(stateNormalized, cols, columns);
  const columnNameToMetadata = enrichMetadata(partColumns, stateNormalized.columnNameToMetadata, sortOverride);
  return {...partColumns, columnNameToMetadata};
};


const  getFetchForDashboard = (dashboard, card, state) => {
  const {parameterValues} = state.dashboard;
    const dashcard = dashboard.ordered_cards.find(c => c.card_id === card.id);
    const dashboardId = dashboard.id;

    const dashboardType = getDashboardType(dashboardId);

    const datasetQuery = applyParameters(
      card,
      dashboard.parameters,
      parameterValues,
      dashcard && dashcard.parameter_mappings,
    );

  if (dashboardType === "public") {
    return sq => fetchDataOrError(
      PublicApi.dashboardCardSuperQuery({
        uuid: dashboardId,
        cardId: card.id,
        "super-query": sq,
        parameters: datasetQuery.parameters
          ? JSON.stringify(datasetQuery.parameters)
          : undefined,
      }));
  }
  else if (dashboardType === "embed") {
    return sq => fetchDataOrError(
        EmbedApi.dashboardCardSuperQuery({
          token: dashboardId,
          dashcardId: dashcard.id,
          cardId: card.id,
          "super-query": sq,
          parameters: getParametersBySlug(
            dashboard.parameters,
            parameterValues,
          ),
        }),
      );
  }
  else
    {
    return sq => fetchDataOrError(
        MetabaseApi.dataset({
          ...datasetQuery,
          "super-query": sq,
        }),
      );
  }

};

const getFetchForQuestion = (card, state, parameters) => {
  const {qb:{parameterValues}} = state;
  const datasetQuery = applyParameters(
    card,
    parameters,
    parameterValues,
  );

  return sq => MetabaseApi.dataset({...datasetQuery, 'super-query' : sq});
};

export const fetchAggregationsDataBuilder =  (dispatch, parameters) => (settings, card, cols) => {
  return dispatch(async (dispatch, getState) => {
    const state = getState();
    const dashboard = getDashboardComplete(state);
    const fetchSuperQuery = dashboard ? getFetchForDashboard(dashboard, card, state) : getFetchForQuestion(card, state, parameters);
    const totalsTasks = getAggregationQueries(settings, cols).map(fetchSuperQuery);
    return [...await Promise.all(totalsTasks)].map(p => p.data).filter(p => p);
  });

};
