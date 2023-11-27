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
import type Metadata from "./metadata/Metadata";
import * as ML from "./v2";

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
  return ML.metadataProvider(databaseId, metadata);
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
  return ML.fromLegacyQuery(databaseId, metadataProvider, query);
}

export const columnFinder =
  (query: ML.Query, columns: ML.ColumnMetadata[]) =>
  (tableName: string, columnName: string): ML.ColumnMetadata => {
    const column = columns.find(column => {
      const displayInfo = ML.displayInfo(query, 0, column);

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
  query: ML.Query,
  column: ML.ColumnMetadata,
  bucketName: string,
) => {
  if (bucketName === "Don't bin") {
    return null;
  }
  const buckets = ML.availableBinningStrategies(query, 0, column);
  const bucket = buckets.find(
    bucket => ML.displayInfo(query, 0, bucket).displayName === bucketName,
  );
  if (!bucket) {
    throw new Error(`Could not find binning strategy ${bucketName}`);
  }
  return bucket;
};

export const findTemporalBucket = (
  query: ML.Query,
  column: ML.ColumnMetadata,
  bucketName: string,
) => {
  if (bucketName === "Don't bin") {
    return null;
  }

  const buckets = ML.availableTemporalBuckets(query, 0, column);
  const bucket = buckets.find(
    bucket => ML.displayInfo(query, 0, bucket).displayName === bucketName,
  );
  if (!bucket) {
    throw new Error(`Could not find temporal bucket ${bucketName}`);
  }
  return bucket;
};

export const findAggregationOperator = (
  query: ML.Query,
  operatorShortName: string,
) => {
  const operators = ML.availableAggregationOperators(query, 0);
  const operator = operators.find(
    operator =>
      ML.displayInfo(query, 0, operator).shortName === operatorShortName,
  );
  if (!operator) {
    throw new Error(`Could not find aggregation operator ${operatorShortName}`);
  }
  return operator;
};

export const queryDrillThru = (
  drillType: ML.DrillThruType,
  query: ML.Query,
  stageIndex: number,
  column?: DatasetColumn,
  value?: RowValue,
  row?: ML.DataRow,
  dimensions?: ML.DataDimension[],
): ML.DrillThru | null => {
  const drills = ML.availableDrillThrus(
    query,
    stageIndex,
    column,
    value,
    row,
    dimensions,
  );
  const drill = drills.find(drill => {
    const drillInfo = ML.displayInfo(query, stageIndex, drill);
    return drillInfo.type === drillType;
  });

  return drill ?? null;
};

export const findDrillThru = (
  drillType: ML.DrillThruType,
  query: ML.Query,
  stageIndex: number,
  column?: DatasetColumn,
  value?: RowValue,
  row?: ML.DataRow,
  dimensions?: ML.DataDimension[],
) => {
  const drill = queryDrillThru(
    drillType,
    query,
    stageIndex,
    column,
    value,
    row,
    dimensions,
  );
  if (!drill) {
    throw new Error(`Could not find drill ${drillType}`);
  }

  const drillInfo = ML.displayInfo(query, stageIndex, drill);
  return { drill, drillInfo };
};
