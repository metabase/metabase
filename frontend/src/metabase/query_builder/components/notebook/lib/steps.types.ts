import type { DatasetQuery } from "metabase-types/types/Card";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Question from "metabase-lib/Question";

export type NotebookStepType =
  | "data"
  | "join"
  | "expression"
  | "filter"
  | "summarize"
  | "aggregate"
  | "breakout"
  | "sort"
  | "limit";

export interface NotebookStep {
  id: string;
  type: NotebookStepType;
  stageIndex: number;
  itemIndex: number;
  query: StructuredQuery;
  valid: boolean;
  active: boolean;
  visible: boolean;
  revert: ((query: StructuredQuery) => StructuredQuery | null) | null;
  clean: (query: StructuredQuery) => StructuredQuery;
  update: (datasetQuery: DatasetQuery) => StructuredQuery;
  actions: NotebookStepAction[];
  previewQuery: StructuredQuery | null;
  next: NotebookStep | null;
  previous: NotebookStep | null;
}

export interface NotebookStepAction {
  type: NotebookStepType;
  action: (args: {
    query?: StructuredQuery;
    openStep: (id: string) => void;
  }) => void;
}

export interface NotebookStepUiComponentProps {
  color: string;
  step: NotebookStep;
  query: StructuredQuery;
  sourceQuestion: Question | undefined;
  updateQuery: (query: StructuredQuery) => Promise<void>;
  isLastOpened: boolean;
  reportTimezone: string;
}
