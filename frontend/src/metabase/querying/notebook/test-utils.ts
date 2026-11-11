/* istanbul ignore file */

import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { NotebookStep } from "./types";

const DEFAULT_CARD = createMockCard({
  id: 1,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
});

export const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [DEFAULT_CARD],
});

export const DEFAULT_QUESTION = new Question(DEFAULT_CARD, metadata);
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
