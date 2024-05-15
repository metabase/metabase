import type React from "react";

import type { IconName } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { ClickActionProps } from "metabase-lib/v1/queries/drills/types";
import type { Series, VisualizationSettings, Card } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export type {
  ClickActionProps,
  ClickObject,
} from "metabase-lib/v1/queries/drills/types";

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
  | "combine"
  | "combine-popover"
  | "details"
  | "extract"
  | "extract-popover"
  | "filter"
  | "info"
  | "records"
  | "new-column"
  | "sort"
  | "standalone_filter"
  | "sum"
  | "summarize"
  | "zoom"
  | "custom";

export type ClickActionSectionDirection = "row" | "column";

export type ClickActionBase = {
  name: string;
  title?: React.ReactNode;
  subTitle?: React.ReactNode;
  section: ClickActionSection;
  sectionTitle?: string;
  sectionDirection?: ClickActionSectionDirection;
  icon?: IconName;
  iconText?: string;
  buttonType: ClickActionButtonType;
  tooltip?: string;
  extra?: () => Record<string, unknown>;
};

type ReduxClickActionBase = {
  action: () => Dispatcher;
};

export type ReduxClickAction = ClickActionBase & ReduxClickActionBase;

export type QuestionChangeClickActionBase = {
  question: () => Question;
};

export type QuestionChangeClickAction = ClickActionBase &
  QuestionChangeClickActionBase;

export type PopoverClickAction = ClickActionBase & {
  popoverProps?: Record<string, unknown>;
  popover: (props: ClickActionPopoverProps) => JSX.Element;
};

type UrlClickActionBase = {
  ignoreSiteUrl?: boolean;
  url: () => string;
};

export type UrlClickAction = ClickActionBase & UrlClickActionBase;

type CustomClickActionContext = { closePopover: () => void };

type CustomClickActionBase = {
  name: ClickActionBase["name"];
  section: ClickActionBase["section"];
  type: "custom";
};

export type CustomClickAction = ClickActionBase &
  CustomClickActionBase & {
    onClick?: (parameters: CustomClickActionContext) => void;
  };

export type CustomClickActionWithCustomView = CustomClickActionBase & {
  view: (parameters: CustomClickActionContext) => React.JSX.Element;
};

export type RegularClickAction =
  | ReduxClickAction
  | QuestionChangeClickAction
  | PopoverClickAction
  | UrlClickAction;

export type DefaultClickAction = ClickActionBase & {
  default: true;
} & AlwaysDefaultClickActionSubAction;

export type AlwaysDefaultClickActionSubAction =
  | QuestionChangeClickActionBase
  | ReduxClickActionBase
  | UrlClickActionBase;

export type AlwaysDefaultClickAction = {
  name: string;
  defaultAlways: true;
} & AlwaysDefaultClickActionSubAction;

export type ClickAction =
  | RegularClickAction
  | DefaultClickAction
  | AlwaysDefaultClickAction
  | CustomClickAction
  | CustomClickActionWithCustomView;

export type LegacyDrill = (options: ClickActionProps) => ClickAction[];

type OnChangeCardAndRunOpts = {
  previousCard?: Card;
  nextCard: Card;
};

type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;

export type ClickActionPopoverProps = {
  series: Series;
  onClick: (action: RegularClickAction) => void;
  onChangeCardAndRun: OnChangeCardAndRun;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  onResize: (...args: unknown[]) => void;
  onClose: () => void;
};

export const isPopoverClickAction = (
  clickAction: ClickAction,
): clickAction is PopoverClickAction => "popover" in clickAction;

export const isQuestionChangeClickAction = (
  clickAction: ClickAction,
): clickAction is QuestionChangeClickAction => "question" in clickAction;

export const isAlwaysDefaultClickAction = (
  clickAction: ClickAction,
): clickAction is AlwaysDefaultClickAction =>
  "defaultAlways" in clickAction && clickAction.defaultAlways;

export const isRegularClickAction = (
  clickAction: ClickAction,
): clickAction is RegularClickAction =>
  !isAlwaysDefaultClickAction(clickAction);

export type Drill<
  T extends Lib.DrillThruDisplayInfo = Lib.DrillThruDisplayInfo,
> = (options: {
  question: Question;
  query: Lib.Query;
  stageIndex: number;
  drill: Lib.DrillThru;
  drillInfo: T;
  clicked: Lib.ClickObject;
  applyDrill: (drill: Lib.DrillThru, ...args: any[]) => Question;
}) => ClickAction[];

export type QueryClickActionsMode = {
  name: string;
  clickActions: LegacyDrill[];
  fallback?: LegacyDrill;
} & (
  | {
      hasDrills: false;
    }
  | {
      hasDrills: true;
      availableOnlyDrills?: Lib.DrillThruType[];
    }
);

export const isCustomClickAction = (
  clickAction: ClickAction,
): clickAction is CustomClickAction =>
  (clickAction as CustomClickAction).type === "custom" &&
  !("view" in clickAction);

export const isCustomClickActionWithView = (
  action: ClickAction,
): action is CustomClickActionWithCustomView =>
  (action as CustomClickActionWithCustomView).type === "custom" &&
  "view" in action;
