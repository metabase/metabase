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
}

export function createRawCellClickObject({
  column,
  value,
}: RawCellClickObjectOpts): Lib.ClickObject {
  const data = [{ col: column, value }];
  return { column, value, data };
}

interface AggregatedCellClickObjectOpts {
  aggregationColumn: DatasetColumn;
  aggregationColumnValue: RowValue;
  breakoutColumn: DatasetColumn;
  breakoutColumnValue: RowValue;
}

export function createAggregatedCellClickObject({
  aggregationColumn,
  aggregationColumnValue,
  breakoutColumn,
  breakoutColumnValue,
}: AggregatedCellClickObjectOpts): Lib.ClickObject {
  const data = [
    {
      key: breakoutColumn.name,
      col: breakoutColumn,
      value: breakoutColumnValue,
    },
    {
      key: aggregationColumn.name,
      col: aggregationColumn,
      value: aggregationColumnValue,
    },
  ];
  const dimensions = [
    {
      column: breakoutColumn,
      value: breakoutColumnValue,
    },
  ];

  return {
    column: aggregationColumn,
    value: aggregationColumnValue,
    data,
    dimensions,
  };
}

interface PivotCellClickObjectOpts {
  aggregationColumn: DatasetColumn;
  aggregationColumnValue: RowValue;
  breakoutColumn1: DatasetColumn;
  breakoutColumn1Value: RowValue;
  breakoutColumn2: DatasetColumn;
  breakoutColumn2Value: RowValue;
}

export function createPivotCellClickObject({
  aggregationColumn,
  aggregationColumnValue,
  breakoutColumn1,
  breakoutColumn1Value,
  breakoutColumn2,
  breakoutColumn2Value,
}: PivotCellClickObjectOpts): Lib.ClickObject {
  const data = [
    { col: breakoutColumn1, value: breakoutColumn1Value },
    { col: breakoutColumn2, value: breakoutColumn2Value },
    { col: aggregationColumn, value: aggregationColumnValue },
  ];
  const dimensions = [
    { column: breakoutColumn1, value: breakoutColumn1Value },
    { column: breakoutColumn2, value: breakoutColumn2Value },
  ];

  return { value: aggregationColumnValue, data, dimensions };
}

interface LegendItemClickObjectOpts {
  breakoutColumn: DatasetColumn;
  breakoutColumnValue: RowValue;
}

export function createLegendItemClickObject({
  breakoutColumn,
  breakoutColumnValue,
}: LegendItemClickObjectOpts) {
  const dimensions = [{ column: breakoutColumn, value: breakoutColumnValue }];
  return { value: breakoutColumnValue, dimensions };
}
