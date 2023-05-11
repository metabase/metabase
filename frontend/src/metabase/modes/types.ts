import type React from "react";
import type { Dispatch, ReduxAction } from "metabase-types/store";
import type { Series, VisualizationSettings } from "metabase-types/api";
import type Question from "metabase-lib/Question";
import type { ClickActionProps } from "metabase-lib/queries/drills/types";
import { OnChangeCardAndRun } from "metabase-lib/queries/drills/types";

export type {
  ClickActionProps,
  ClickObject,
} from "metabase-lib/queries/drills/types";

type Dispatcher = (dispatch: Dispatch) => void;

export type ClickActionButtonType =
  | "formatting"
  | "horizontal"
  | "info"
  | "token"
  | "token-filter"
  | "sort";

export interface ClickActionBase {
  name: string;
  title?: React.ReactNode;
  section: string; // TODO [26836]: add strict typings
  icon?: React.ReactNode;
  buttonType: ClickActionButtonType;
  default?: boolean;
  tooltip?: string;
  extra?: () => Record<string, unknown>;
}

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

export type RegularClickAction =
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

export type ClickAction = RegularClickAction | AlwaysDefaultClickAction;

export type Drill = (options: ClickActionProps) => ClickAction[];

export type ClickActionPopoverProps = {
  series: Series;
  onClick: (action: RegularClickAction) => void;
  onChangeCardAndRun: OnChangeCardAndRun;
  onChange: (settings: VisualizationSettings) => void;
  onResize: (...args: unknown[]) => void;
  onClose: () => void;
};

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
