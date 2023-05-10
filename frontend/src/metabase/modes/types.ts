import React from "react";
import type {
  DatasetColumn,
  RowValue,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import type { Dispatch, ReduxAction } from "metabase-types/store";
import type { OnChangeCardAndRun } from "metabase/visualizations/types";
import type Question from "metabase-lib/Question";

type DimensionValue = {
  value: RowValue;
  column: DatasetColumn;
};

export type ClickObject = {
  value?: RowValue;
  column?: DatasetColumn;
  dimensions?: DimensionValue[];
  event?: MouseEvent;
  element?: HTMLElement;
  seriesIndex?: number;
  settings?: Record<string, unknown>;
  origin?: {
    row: RowValue;
    cols: DatasetColumn[];
  };
  extraData?: Record<string, unknown>;
};

type Dispatcher = (dispatch: Dispatch) => void;

export type ClickActionPopoverProps = {
  series: Series;
  onClick: (action: ClickAction) => void;
  onChangeCardAndRun: OnChangeCardAndRun;
  onChange: (settings: VisualizationSettings) => void;
  onResize: (...args: unknown[]) => void;
  onClose: () => void;
};

export type ClickActionButtonType =
  | "formatting"
  | "horizontal"
  | "info"
  | "token"
  | "token-filter"
  | "sort";

export type ClickActionBase = {
  name: string;
  title?: React.ReactNode;
  section: string; // TODO [26836]: add strict typings
  icon?: React.ReactNode;
  buttonType: ClickActionButtonType;
  default?: boolean;
  tooltip?: string;
  extra?: () => Record<string, unknown>;
};

type ReduxClickAction = ClickActionBase & {
  action: () => ReduxAction | Dispatcher;
};

export type QuestionChangeClickAction = ClickActionBase & {
  question: () => Question;
};

export type PopoverClickAction = ClickActionBase & {
  popoverProps?: Record<string, unknown>;
  popover: (props: ClickActionPopoverProps) => JSX.Element;
};

export type UrlClickAction = ClickActionBase & {
  ignoreSiteUrl?: boolean;
  url: () => string;
};

type RegularClickAction =
  | ReduxClickAction
  | QuestionChangeClickAction
  | PopoverClickAction
  | UrlClickAction;

type AlwaysDefaultClickAction = Omit<
  RegularClickAction,
  "title" | "section" | "default" | "buttonType" | "tooltip"
> & {
  defaultAlways: true;
};

// TODO [#26836]: unify this and frontend/src/metabase-types/types/Visualization.ts
export type ClickAction = RegularClickAction | AlwaysDefaultClickAction;

export type DrillOptions = {
  question: Question;
  clicked?: ClickObject;
};

export type Drill = (options: DrillOptions) => ClickAction[];

export const isReduxClickAction = (
  clickAction: ClickAction,
): clickAction is ReduxClickAction => "action" in clickAction;

export const isQuestionChangeClickAction = (
  clickAction: ClickAction,
): clickAction is QuestionChangeClickAction => "question" in clickAction;

export const isPopoverClickAction = (
  clickAction: ClickAction,
): clickAction is PopoverClickAction => "popover" in clickAction;

export const isUrlClickAction = (
  clickAction: ClickAction,
): clickAction is UrlClickAction => "url" in clickAction;

export const isRegularClickAction = (
  clickAction: ClickAction,
): clickAction is RegularClickAction =>
  isReduxClickAction(clickAction) ||
  isQuestionChangeClickAction(clickAction) ||
  isPopoverClickAction(clickAction) ||
  isUrlClickAction(clickAction);
