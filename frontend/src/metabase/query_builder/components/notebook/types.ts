import type { Query } from "metabase-lib";
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

type RevertFn = (query: Query, stageIndex: number, index?: number) => Query;

export interface NotebookStep {
  id: string;
  type: NotebookStepType;
  stageIndex: number;
  itemIndex: number | null;
  question: Question;
  query: Query;
  valid: boolean;
  active: boolean;
  visible: boolean;
  testID: string;
  revert: RevertFn | null;
  actions: NotebookStepAction[];
  next: NotebookStep | null;
  previous: NotebookStep | null;
  getPreviewQuery?: (() => Query) | undefined;
}

export interface NotebookStepAction {
  type: NotebookStepType;
  action: (args: { openStep: (id: string) => void }) => void;
}

export interface NotebookStepUiComponentProps {
  step: NotebookStep;
  query: Query;
  stageIndex: number;
  sourceQuestion?: Question;
  color: string;
  isLastOpened: boolean;
  reportTimezone: string;
  readOnly?: boolean;
  updateQuery: (query: Query) => Promise<void>;
}

export type OpenSteps = Record<NotebookStep["id"], boolean>;
