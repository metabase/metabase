import type React from "react";

import type { IconName } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import type { ClickActionProps } from "metabase-lib/queries/drills/types";
import type { Series, VisualizationSettings, Card } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

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
  | "extract"
  | "extract-popover"
  | "filter"
  | "info"
  | "records"
  | "sort"
  | "standalone_filter"
  | "sum"
  | "summarize"
  | "zoom";

export type ClickActionSectionDirection = "row" | "column";

export type ClickActionBase = {
  name: string;
  title?: React.ReactNode;
  section: ClickActionSection;
  sectionTitle?: string;
  sectionDirection?: ClickActionSectionDirection;
  icon?: IconName;
  iconText?: string;
  buttonType: ClickActionButtonType;
  default?: boolean;
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
  | AlwaysDefaultClickAction;

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
  isDashboard: boolean;
  applyDrill: (drill: Lib.DrillThru, ...args: any[]) => Question;
}) => ClickAction[];

export interface QueryClickActionsMode {
  name: string;
  hasDrills: boolean;
  clickActions: LegacyDrill[];
  fallback?: LegacyDrill;
}
