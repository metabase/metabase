import type React from "react";
import type { Dispatch, GetState } from "metabase-types/store";
import type { Series, VisualizationSettings } from "metabase-types/api";
import type Question from "metabase-lib/Question";
import type {
  ClickActionProps,
  OnChangeCardAndRun,
} from "metabase-lib/queries/drills/types";

export type {
  ClickActionProps,
  ClickObject,
} from "metabase-lib/queries/drills/types";

type Dispatcher = (dispatch: Dispatch, getState: GetState) => void;

export type ClickActionButtonType =
  | "formatting"
  | "horizontal"
  | "info"
  | "sort"
  | "token"
  | "token-filter";

export type ClickActionSection =
  | "auto"
  | "auto-popover"
  | "breakout"
  | "breakout-popover"
  | "details"
  | "filter"
  | "info"
  | "records"
  | "sort"
  | "standalone_filter"
  | "sum"
  | "summarize"
  | "zoom";

export type ClickActionBase = {
  name: string;
  title?: React.ReactNode;
  section: ClickActionSection;
  icon?: React.ReactNode;
  buttonType: ClickActionButtonType;
  default?: boolean;
  tooltip?: string;
  extra?: () => Record<string, unknown>;
};

type ReduxClickActionBase = {
  action: () => Dispatcher;
};

export type ReduxClickAction = ClickActionBase & ReduxClickActionBase;

export type QuestionChangeClickAction = ClickActionBase & {
  question: () => Question;
};

export type PopoverClickAction = ClickActionBase & {
  popoverProps?: Record<string, unknown>;
  popover: (props: ClickActionPopoverProps) => JSX.Element;
};

type UrlClickActionBase = {
  ignoreSiteUrl?: boolean;
  forceSameOrigin?: boolean;
  url: () => string;
};

export type UrlClickAction = ClickActionBase & UrlClickActionBase;

export type RegularClickAction =
  | ReduxClickAction
  | QuestionChangeClickAction
  | PopoverClickAction
  | UrlClickAction;

export type AlwaysDefaultClickActionSubAction =
  | ReduxClickActionBase
  | UrlClickActionBase;

export type AlwaysDefaultClickAction = {
  name: string;
  defaultAlways: true;
} & AlwaysDefaultClickActionSubAction;

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

export const isPopoverClickAction = (
  clickAction: ClickAction,
): clickAction is PopoverClickAction => "popover" in clickAction;

export const isQuestionChangeClickAction = (
  clickAction: ClickAction,
): clickAction is QuestionChangeClickAction => "question" in clickAction;

export const AlwaysDefaultClickAction = (
  clickAction: ClickAction,
): clickAction is AlwaysDefaultClickAction =>
  "defaultAlways" in clickAction && clickAction.defaultAlways;

export const isRegularClickAction = (
  clickAction: ClickAction,
): clickAction is RegularClickAction => !AlwaysDefaultClickAction(clickAction);
