/* istanbul ignore file */

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type { NotebookStep } from "./types";

export const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [createSavedStructuredCard({ id: 1 })],
});

export const DEFAULT_QUESTION = checkNotNull(metadata.question(1));
export const DEFAULT_LEGACY_QUERY = DEFAULT_QUESTION.query() as StructuredQuery;
export const DEFAULT_QUERY = DEFAULT_QUESTION._getMLv2Query();

export function createMockNotebookStep({
  id = "test-step",
  type = "data",
  stageIndex = 0,
  itemIndex = 0,
  ...opts
}: Partial<NotebookStep> = {}): NotebookStep {
  return {
    id,
    type,
    stageIndex,
    isLastStage: true,
    itemIndex,
    testID: `step-${type}-${stageIndex}-${itemIndex}`,
    topLevelQuery: DEFAULT_QUERY,
    query: DEFAULT_LEGACY_QUERY,
    valid: true,
    active: true,
    visible: true,
    actions: [],
    previewQuery: null,
    next: null,
    previous: null,
    revert: jest.fn(),
    clean: jest.fn(),
    update: jest.fn(),
    ...opts,
  };
}
