import type { DatasetQuery } from "metabase-types/types/Card";
import type { Query } from "metabase-lib/types";
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

export type NotebookStepFn<ReturnType> = (
  query: StructuredQuery,
  index: number | undefined | null,
  topLevelQuery: Query,
  stageIndex: number,
) => ReturnType;

export interface NotebookStep {
  id: string;
  type: NotebookStepType;
  stageIndex: number;
  itemIndex: number | null;
  topLevelQuery: Query;
  query: StructuredQuery;
  valid: boolean;
  active: boolean;
  visible: boolean;
  revert: NotebookStepFn<StructuredQuery | null> | null;
  clean: NotebookStepFn<StructuredQuery>;
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
  step: NotebookStep;
  topLevelQuery: Query;
  query: StructuredQuery;
  sourceQuestion?: Question;
  color: string;
  isLastOpened: boolean;
  reportTimezone: string;
  readOnly?: boolean;
  updateQuery: (query: StructuredQuery | Query) => Promise<void>;
}

export type OpenSteps = Record<NotebookStep["id"], boolean>;
