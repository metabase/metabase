/* istanbul ignore file */

import { getSavedStructuredQuestion } from "metabase-lib/mocks";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type { NotebookStep } from "./types";

export const DEFAULT_QUESTION = getSavedStructuredQuestion();
export const DEFAULT_LEGACY_QUERY = DEFAULT_QUESTION.query() as StructuredQuery;
export const DEFAULT_QUERY = DEFAULT_QUESTION._getMLv2Query();

export function createMockNotebookStep(
  opts: Partial<NotebookStep> = {},
): NotebookStep {
  return {
    id: "test-step",
    type: "data",
    stageIndex: 0,
    itemIndex: 0,
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
