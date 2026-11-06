/* istanbul ignore file */

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { NotebookStep } from "./types";

export const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [
    createMockCard({
      id: 1,
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    }),
  ],
});

export const DEFAULT_QUESTION = checkNotNull(metadata.question(1));
export const DEFAULT_QUERY = DEFAULT_QUESTION.query();

export function createMockNotebookStep({
  id = "test-step",
  type = "data",
  clauseType = "data",
  stageIndex = 0,
  itemIndex = 0,
  ...opts
}: Partial<NotebookStep> = {}): NotebookStep {
  return {
    id,
    type,
    clauseType,
    stageIndex,
    itemIndex,
    testID: `step-${type}-${stageIndex}-${itemIndex}`,
    question: DEFAULT_QUESTION,
    query: DEFAULT_QUERY,
    valid: true,
    active: true,
    visible: true,
    actions: [],
    next: null,
    previous: null,
    revert: jest.fn(),
    ...opts,
  };
}

const SAMPLE_TABLE_IDS = {
  ORDERS: ORDERS_ID,
  PEOPLE: PEOPLE_ID,
};

export type SampleTableName = keyof typeof SAMPLE_TABLE_IDS;

export function createSampleTableQuery(
  tableName: SampleTableName,
  fieldNames?: string[],
) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: SAMPLE_TABLE_IDS[tableName] },
        fields: fieldNames?.map((name) => ({
          type: "column",
          sourceName: tableName,
          name,
        })),
      },
    ],
  });
}

export function getColumnNames(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
) {
  return columns.map(
    (column) => Lib.displayInfo(query, stageIndex, column).name,
  );
}
