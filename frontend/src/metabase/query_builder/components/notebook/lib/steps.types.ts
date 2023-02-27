import type { DatasetQuery } from "metabase-types/types/Card";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Question from "metabase-lib/Question";

export enum QuestionStepType {
  Data = "data",
  Join = "join",
  Expression = "expression",
  Filter = "filter",
  Summarize = "summarize",
  Aggregate = "aggregate",
  Breakout = "breakout",
  Sort = "sort",
  Limit = "limit",
}

export interface QuestionStep {
  id: string;
  type: QuestionStepType;
  stageIndex: number;
  itemIndex: number;
  query: StructuredQuery;
  valid: boolean;
  active: boolean;
  visible: boolean;
  revert: ((query: StructuredQuery) => StructuredQuery | null) | null;
  clean: (query: StructuredQuery) => StructuredQuery;
  update: (datasetQuery: DatasetQuery) => StructuredQuery;
  actions: QuestionStepAction[];
  previewQuery: StructuredQuery | null;
  next: QuestionStep | null;
  previous: QuestionStep | null;
}

export interface QuestionStepAction {
  type: QuestionStepType;
  action: (args: {
    query?: StructuredQuery;
    openStep: (id: string) => void;
  }) => void;
}

export interface NotebookStepUiComponentProps {
  color: string;
  step: QuestionStep;
  query: StructuredQuery;
  sourceQuestion: Question | undefined;
  updateQuery: (query: StructuredQuery) => Promise<void>;
  isLastOpened: boolean;
  reportTimezone: string;
}
