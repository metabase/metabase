import type React from "react";
import type { Dispatch, GetState } from "metabase-types/store";
import type {
  Series,
  VisualizationSettings,
  Card,
  DatasetQuery,
} from "metabase-types/api";
import type { UpdateQuestionOpts } from "metabase/query_builder/actions";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import type { ClickActionProps } from "metabase-lib/queries/drills/types";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

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

export type Drill = (options: ClickActionProps) => ClickAction[];

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

export type DrillMLv2<
  T extends Lib.DrillThruDisplayInfo = Lib.DrillThruDisplayInfo,
> = (
  options: ClickActionProps & {
    drill: Lib.DrillThru;
    drillDisplayInfo: T;
    applyDrill: (drill: Lib.DrillThru, ...args: any[]) => Question;
  },
) => ClickAction[];

export interface ModeFooterComponentProps {
  lastRunCard: Card;
  question: Question;
  query: StructuredQuery;
  className?: string;

  updateQuestion: (newQuestion: Question, options?: UpdateQuestionOpts) => void;
  setDatasetQuery: (
    datasetQuery: DatasetQuery,
    options?: UpdateQuestionOpts,
  ) => void;
}

export interface QueryClickActionsMode {
  name: string;

  // drills that change query get resolved from MLv2 in Visualization. Here we list only additional actions we need
  // drills: DrillMLv2[];

  clickActions?: Drill[];
  fallback?: Drill;
  ModeFooter?: (props: ModeFooterComponentProps) => JSX.Element;
}
