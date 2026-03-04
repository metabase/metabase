import type { ColorName } from "metabase/lib/colors/types";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type { NotebookDataPickerProps } from "./components/NotebookDataPicker";

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
  allowPopoverWhenReadOnly?: boolean;
}

export interface NotebookStepAction {
  type: NotebookStepType;
  action: (args: { openStep: (id: string) => void }) => void;
}

export type NotebookDataPickerOptions = Pick<
  NotebookDataPickerProps,
  "shouldDisableItem"
>;

export interface NotebookStepProps {
  step: NotebookStep;
  query: Lib.Query;
  stageIndex: number;
  color: ColorName;
  isLastOpened: boolean;
  reportTimezone: string;
  readOnly?: boolean;
  updateQuery: (query: Lib.Query) => Promise<void>;
  dataPickerOptions?: NotebookDataPickerOptions;
}

export interface NotebookStepHeaderProps {
  step: NotebookStep;
  title: string;
  color: ColorName;
  canRevert: boolean;
  onRevert?: () => void;
}

export type OpenSteps = Record<NotebookStep["id"], boolean>;
