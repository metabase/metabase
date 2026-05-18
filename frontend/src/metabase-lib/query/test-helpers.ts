/* istanbul ignore file */

import { createMockMetadata } from "__support__/metadata";
import { availableDrillThrus } from "metabase-lib/query/drills";
import { displayInfo, metadataProvider } from "metabase-lib/query/metadata";
import {
  createTestJsNativeQuery,
  createTestJsQuery,
  createTestNativeQuery,
  createTestQuery,
} from "metabase-lib/query/query";
import type {
  ClickObject,
  ColumnMetadata,
  DrillThru,
  DrillThruType,
  ExpressionArg,
  ExpressionClause,
  ExpressionOperator,
  ExpressionOptions,
  Query,
} from "metabase-lib/query/types";
import type { DatabaseId, TestQuerySpec } from "metabase-types/api";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { Metadata } from "./metadata";

const SAMPLE_DATABASE = createSampleDatabase();

const SAMPLE_METADATA = createMockMetadata({ databases: [SAMPLE_DATABASE] });

const SAMPLE_PROVIDER = createMetadataProvider();

export { SAMPLE_DATABASE, SAMPLE_METADATA, SAMPLE_PROVIDER };
export {
  createTestJsNativeQuery,
  createTestJsQuery,
  createTestNativeQuery,
  createTestQuery,
};

type MetadataProviderOpts = {
  databaseId?: DatabaseId;
  metadata?: Metadata;
};

export function createMetadataProvider({
  databaseId = SAMPLE_DATABASE.id,
  metadata = SAMPLE_METADATA,
}: MetadataProviderOpts = {}) {
  return metadataProvider(databaseId, metadata);
}

export const DEFAULT_TEST_QUERY: TestQuerySpec = {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
    },
  ],
};

export const columnFinder =
  (query: Query, columns: ColumnMetadata[]) =>
  (
    tableName: string | undefined | null,
    columnName: string,
  ): ColumnMetadata => {
    const column = columns.find((column) => {
      const columnDisplayInfo = displayInfo(query, 0, column);

      // for non-table columns - aggregations, custom columns
      if (!columnDisplayInfo.table || tableName == null) {
        return columnDisplayInfo.name === columnName;
      }

      return (
        columnDisplayInfo.table.name === tableName &&
        columnDisplayInfo.name === columnName
      );
    });

    if (!column) {
      throw new Error(`Could not find ${tableName}.${columnName}`);
    }

    return column;
  };

export interface ExpressionClauseOpts {
  name: string;
  operator: ExpressionOperator;
  args: (ExpressionArg | ExpressionClause)[];
  options?: ExpressionOptions | null;
}

export const queryDrillThru = (
  query: Query,
  stageIndex: number,
  clickObject: ClickObject,
  drillType: DrillThruType,
): DrillThru | null => {
  const drills = availableDrillThrus(
    query,
    stageIndex,
    undefined,
    clickObject.column,
    clickObject.value,
    clickObject.data,
    clickObject.dimensions,
  );
  const drill = drills.find((drill) => {
    const drillInfo = displayInfo(query, stageIndex, drill);
    return drillInfo.type === drillType;
  });

  return drill ?? null;
};
