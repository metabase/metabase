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
  settings?: Record<string, unknown>;
  extraData?: Record<string, unknown>;
  seriesIndex?: number;
  origin?: {
    row: RowValue;
    cols: DatasetColumn[];
  };
  event?: MouseEvent;
  element?: HTMLElement;
};

type Dispatcher = (dispatch: Dispatch) => void;

export type ClickActionPopoverProps = {
  series: Series;
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
  section: string;
  icon?: string;
  buttonType: ClickActionButtonType;
  default?: boolean;
  tooltip?: string;
  extra?: () => Record<string, unknown>;
};

type ReduxClickAction = ClickActionBase & {
  action: () => ReduxAction | Dispatcher;
};

type QuestionChangeClickAction = ClickActionBase & {
  question: () => Question;
};

type PopoverClickAction = ClickActionBase & {
  popoverProps?: Record<string, unknown>;
  popover: (props: ClickActionPopoverProps) => JSX.Element;
};

type UrlClickAction = ClickActionBase & {
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

export type ClickAction = RegularClickAction | AlwaysDefaultClickAction;

export type DrillOptions = {
  question: Question;
  clicked?: ClickObject;
};

export type Drill = (options: DrillOptions) => ClickAction[];
