/* istanbul ignore file */

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import type { NotebookStep } from "./types";

export const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [createSavedStructuredCard({ id: 1 })],
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
