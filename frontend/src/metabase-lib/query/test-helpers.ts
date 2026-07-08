/* istanbul ignore file */

import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
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

type MetadataProviderOpts = {
  databaseId?: DatabaseId;
  metadata?: Metadata;
};

export function createMetadataProvider({
  databaseId = SAMPLE_DATABASE.id,
  metadata = SAMPLE_METADATA,
}: MetadataProviderOpts = {}) {
  return Lib.metadataProvider(databaseId, metadata);
}

export const DEFAULT_TEST_QUERY: TestQuerySpec = {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
    },
  ],
};

export const columnFinder =
  (query: Lib.Query, columns: Lib.ColumnMetadata[]) =>
  (
    tableName: string | undefined | null,
    columnName: string,
  ): Lib.ColumnMetadata => {
    const column = columns.find((column) => {
      const displayInfo = Lib.displayInfo(query, 0, column);

      // for non-table columns - aggregations, custom columns
      if (!displayInfo.table || tableName == null) {
        return displayInfo.name === columnName;
      }

      return (
        displayInfo.table.name === tableName && displayInfo.name === columnName
      );
    });

    if (!column) {
      throw new Error(`Could not find ${tableName}.${columnName}`);
    }

    return column;
  };

export interface ExpressionClauseOpts {
  name: string;
  operator: Lib.ExpressionOperator;
  args: (Lib.ExpressionArg | Lib.ExpressionClause)[];
  options?: Lib.ExpressionOptions | null;
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
    undefined,
    clickObject.column,
    clickObject.value,
    clickObject.data,
    clickObject.dimensions,
  );
  const drill = drills.find((drill) => {
    const drillInfo = Lib.displayInfo(query, stageIndex, drill);
    return drillInfo.type === drillType;
  });

  return drill ?? null;
};
