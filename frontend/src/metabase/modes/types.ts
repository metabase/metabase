import type React from "react";
import type { Dispatch, ReduxAction } from "metabase-types/store";
import type Question from "metabase-lib/Question";
import type {
  ClickAction as ClickActionBaseI,
  ClickActionPopoverProps,
  ClickActionProps,
} from "metabase-lib/queries/drills/types";

export type {
  ClickActionProps,
  ClickActionPopoverProps,
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

export interface ClickActionBase extends ClickActionBaseI {
  name: string;
  title?: React.ReactNode;
  section: string;
  icon?: string;
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

type UrlClickAction = ClickActionBase & {
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
