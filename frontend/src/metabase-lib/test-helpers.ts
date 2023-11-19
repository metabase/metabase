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
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
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

export const getAvailableDrills = ({
  question = Question.create({
    metadata: SAMPLE_METADATA,
    dataset_query: DEFAULT_QUERY,
  }),
  clickedColumnName,
  stageIndex = -1,
  columns,
  rowValues,
  clickType,
}: {
  question?: Question;
  clickedColumnName: string;
  stageIndex?: number;
  columns: Record<string, DatasetColumn>;
  rowValues: Record<string, RowValue>;
  clickType: "cell" | "header";
}) => {
  const query = question._getMLv2Query();
  const legacyQuery = question.query() as StructuredQuery;

  const legacyColumns = legacyQuery.columns();
  const column = columns[clickedColumnName];

  const clickedCellValue = rowValues[clickedColumnName];

  const row = legacyColumns.map(({ name }) => ({
    col: columns[name],
    value: rowValues[name],
  }));

  const dimensions =
    legacyQuery.aggregations().length > 0
      ? row
          .filter(
            ({ col }) =>
              col?.source === "breakout" && col?.name !== clickedColumnName,
          )
          .map(({ value, col }) => ({ value, column: col }))
      : undefined;

  const drills =
    clickType === "cell"
      ? ML.availableDrillThrus(
          query,
          stageIndex,
          column,
          clickedCellValue,
          row,
          dimensions,
        )
      : ML.availableDrillThrus(
          query,
          stageIndex,
          column,
          undefined,
          undefined,
          undefined,
        );

  const drillsDisplayInfo = drills.map(drill =>
    ML.displayInfo(query, stageIndex, drill),
  );

  return {
    drills,
    drillsDisplayInfo,

    query,
    column,
    stageIndex,
  };
};

export const getAvailableDrillByType = ({
  question = Question.create({
    metadata: SAMPLE_METADATA,
    dataset_query: DEFAULT_QUERY,
  }),
  clickedColumnName,
  stageIndex = -1,
  columns,
  rowValues,
  clickType,
  drillType,
}: {
  question?: Question;
  clickedColumnName: string;
  stageIndex?: number;
  columns: Record<string, DatasetColumn>;
  rowValues: Record<string, RowValue>;
  clickType: "cell" | "header";
  drillType: ML.DrillThruType;
}) => {
  const { drills, drillsDisplayInfo, query } = getAvailableDrills({
    question,
    clickedColumnName,
    stageIndex,
    columns,
    rowValues,
    clickType,
  });

  const drillIndex = drillsDisplayInfo.findIndex(
    ({ type }) => type === drillType,
  );
  const drill = drills[drillIndex];
  const drillDisplayInfo = drillsDisplayInfo[drillIndex];

  if (!drill) {
    throw new TypeError(`Failed to find ${drillType} drill`);
  }

  return {
    drill,
    drillDisplayInfo,
    query,
    stageIndex,
  };
};
