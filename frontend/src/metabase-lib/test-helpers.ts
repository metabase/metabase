/* istanbul ignore file */

import { createMockMetadata } from "__support__/metadata";
import type {
  DatabaseId,
  DatasetQuery,
  DatasetColumn,
  RowValue,
} from "metabase-types/api";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/metadata/Metadata";

const SAMPLE_DATABASE = createSampleDatabase();

const SAMPLE_METADATA = createMockMetadata({ databases: [SAMPLE_DATABASE] });

export { SAMPLE_DATABASE, SAMPLE_METADATA };

type MetadataProviderOpts = {
  databaseId?: DatabaseId;
  metadata?: Metadata;
};

function createMetadataProvider({
  databaseId = SAMPLE_DATABASE.id,
  metadata = SAMPLE_METADATA,
}: MetadataProviderOpts = {}) {
  return Lib.metadataProvider(databaseId, metadata);
}

export const DEFAULT_QUERY: DatasetQuery = {
  database: SAMPLE_DATABASE.id,
  type: "query",
  query: {
    "source-table": ORDERS_ID,
  },
};

type QueryOpts = MetadataProviderOpts & {
  query?: DatasetQuery;
};

export function createQuery({
  databaseId = SAMPLE_DATABASE.id,
  metadata = SAMPLE_METADATA,
  query = DEFAULT_QUERY,
}: QueryOpts = {}) {
  const metadataProvider = createMetadataProvider({ databaseId, metadata });
  return Lib.fromLegacyQuery(databaseId, metadataProvider, query);
}

export const columnFinder =
  (query: Lib.Query, columns: Lib.ColumnMetadata[]) =>
  (tableName: string, columnName: string): Lib.ColumnMetadata => {
    const column = columns.find(column => {
      const displayInfo = Lib.displayInfo(query, 0, column);

      // for non-table columns - aggregations, custom columns
      if (!displayInfo.table) {
        return displayInfo?.name === columnName;
      }

      return (
        displayInfo?.table?.name === tableName &&
        displayInfo?.name === columnName
      );
    });

    if (!column) {
      throw new Error(`Could not find ${tableName}.${columnName}`);
    }

    return column;
  };

export const findBinningStrategy = (
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  bucketName: string,
) => {
  if (bucketName === "Don't bin") {
    return null;
  }
  const buckets = Lib.availableBinningStrategies(query, 0, column);
  const bucket = buckets.find(
    bucket => Lib.displayInfo(query, 0, bucket).displayName === bucketName,
  );
  if (!bucket) {
    throw new Error(`Could not find binning strategy ${bucketName}`);
  }
  return bucket;
};

export const findTemporalBucket = (
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  bucketName: string,
) => {
  if (bucketName === "Don't bin") {
    return null;
  }

  const buckets = Lib.availableTemporalBuckets(query, 0, column);
  const bucket = buckets.find(
    bucket => Lib.displayInfo(query, 0, bucket).displayName === bucketName,
  );
  if (!bucket) {
    throw new Error(`Could not find temporal bucket ${bucketName}`);
  }
  return bucket;
};

export const findAggregationOperator = (
  query: Lib.Query,
  operatorShortName: string,
) => {
  const operators = Lib.availableAggregationOperators(query, 0);
  const operator = operators.find(
    operator =>
      Lib.displayInfo(query, 0, operator).shortName === operatorShortName,
  );
  if (!operator) {
    throw new Error(`Could not find aggregation operator ${operatorShortName}`);
  }
  return operator;
};

function withTemporalBucketAndBinningStrategy(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  temporalBucketName = "Don't bin",
  binningStrategyName = "Don't bin",
) {
  return Lib.withTemporalBucket(
    Lib.withBinning(
      column,
      findBinningStrategy(query, column, binningStrategyName),
    ),
    findTemporalBucket(query, column, temporalBucketName),
  );
}

interface AggregationClauseOpts {
  operatorName: string;
}

interface BreakoutClauseOpts {
  columnName: string;
  tableName: string;
  temporalBucketName?: string;
  binningStrategyName?: string;
}

interface OrderByClauseOpts {
  columnName: string;
  tableName: string;
  direction: Lib.OrderByDirection;
}

interface QueryWithClausesOpts {
  query?: Lib.Query;
  aggregations?: AggregationClauseOpts[];
  breakouts?: BreakoutClauseOpts[];
  orderBys?: OrderByClauseOpts[];
}

export function createQueryWithClauses({
  query = createQuery(),
  aggregations = [],
  breakouts = [],
  orderBys = [],
}: QueryWithClausesOpts) {
  const queryWithAggregations = aggregations.reduce((query, aggregation) => {
    return Lib.aggregate(
      query,
      -1,
      Lib.aggregationClause(
        findAggregationOperator(query, aggregation.operatorName),
      ),
    );
  }, query);

  const queryWithBreakouts = breakouts.reduce((query, breakout) => {
    const breakoutColumn = columnFinder(
      query,
      Lib.breakoutableColumns(query, -1),
    )(breakout.tableName, breakout.columnName);
    return Lib.breakout(
      query,
      -1,
      withTemporalBucketAndBinningStrategy(
        query,
        breakoutColumn,
        breakout.temporalBucketName,
        breakout.binningStrategyName,
      ),
    );
  }, queryWithAggregations);

  return orderBys.reduce((query, orderBy) => {
    const orderByColumn = columnFinder(query, Lib.orderableColumns(query, -1))(
      orderBy.tableName,
      orderBy.columnName,
    );
    return Lib.orderBy(query, -1, orderByColumn, orderBy.direction);
  }, queryWithBreakouts);
}

export const queryDrillThru = (
  query: Lib.Query,
  stageIndex: number,
  clickObject: Lib.ClickObject,
  drillType: Lib.DrillThruType,
): Lib.DrillThru | null => {
  const drills = Lib.availableDrillThrus(
    query,
    stageIndex,
    clickObject.column,
    clickObject.value,
    clickObject.data,
    clickObject.dimensions,
  );
  const drill = drills.find(drill => {
    const drillInfo = Lib.displayInfo(query, stageIndex, drill);
    return drillInfo.type === drillType;
  });

  return drill ?? null;
};

export const findDrillThru = (
  query: Lib.Query,
  stageIndex: number,
  clickObject: Lib.ClickObject,
  drillType: Lib.DrillThruType,
) => {
  const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
  if (!drill) {
    throw new Error(`Could not find drill ${drillType}`);
  }

  const drillInfo = Lib.displayInfo(query, stageIndex, drill);
  return { drill, drillInfo };
};

interface ColumnClickObjectOpts {
  column: DatasetColumn;
}

export function createColumnClickObject({
  column,
}: ColumnClickObjectOpts): Lib.ClickObject {
  return { column };
}

interface RawCellClickObjectOpts {
  column: DatasetColumn;
  value: RowValue;
  data?: Lib.ClickObjectDataRow[];
}

export function createRawCellClickObject({
  column,
  value,
  data = [{ col: column, value }],
}: RawCellClickObjectOpts): Lib.ClickObject {
  return { column, value, data };
}

interface AggregatedCellClickObjectOpts {
  aggregation: Lib.ClickObjectDimension;
  breakouts: Lib.ClickObjectDimension[];
}

export function createAggregatedCellClickObject({
  aggregation,
  breakouts,
}: AggregatedCellClickObjectOpts): Lib.ClickObject {
  const data = [...breakouts, aggregation].map(({ column, value }) => ({
    key: column.name,
    col: column,
    value,
  }));

  return {
    column: aggregation.column,
    value: aggregation.value,
    data,
    dimensions: breakouts,
  };
}

interface PivotCellClickObjectOpts {
  aggregation: Lib.ClickObjectDimension;
  breakouts: Lib.ClickObjectDimension[];
}

export function createPivotCellClickObject({
  aggregation,
  breakouts,
}: PivotCellClickObjectOpts): Lib.ClickObject {
  const data = [...breakouts, aggregation].map(({ column, value }) => ({
    key: column.name,
    col: column,
    value,
  }));

  return { value: aggregation.value, data, dimensions: breakouts };
}

export function createLegendItemClickObject(
  dimension: Lib.ClickObjectDimension,
) {
  return { dimensions: [dimension] };
}
