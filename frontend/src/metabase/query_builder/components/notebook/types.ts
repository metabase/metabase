import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

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

type RevertFn = (
  query: Lib.Query,
  stageIndex: number,
  index?: number,
) => Lib.Query;

export interface NotebookStep {
  id: string;
  type: NotebookStepType;
  clauseType: Lib.ClauseType;
  stageIndex: number;
  itemIndex: number | null;
  question: Question;
  query: Lib.Query;
  valid: boolean;
  active: boolean;
  visible: boolean;
  testID: string;
  revert: RevertFn | null;
  actions: NotebookStepAction[];
  next: NotebookStep | null;
  previous: NotebookStep | null;
  previewQuery?: Lib.Query | null;
}

export interface NotebookStepAction {
  type: NotebookStepType;
  action: (args: { openStep: (id: string) => void }) => void;
}

export interface NotebookStepUiComponentProps {
  step: NotebookStep;
  query: Lib.Query;
  stageIndex: number;
  color: string;
  isLastOpened: boolean;
  reportTimezone: string;
  readOnly?: boolean;
  updateQuery: (query: Lib.Query) => Promise<void>;
}

export type OpenSteps = Record<NotebookStep["id"], boolean>;
