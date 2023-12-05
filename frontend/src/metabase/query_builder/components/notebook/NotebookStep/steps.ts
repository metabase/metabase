import type * as React from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";

import type { IconName } from "metabase/core/components/Icon";
import { DataStep } from "../steps/DataStep";
import { JoinStep } from "../steps/JoinStep";
import ExpressionStep from "../steps/ExpressionStep";
import { FilterStep } from "../steps/FilterStep";
import { AggregateStep } from "../steps/AggregateStep";
import BreakoutStep from "../steps/BreakoutStep";
import SummarizeStep from "../steps/SummarizeStep";
import SortStep from "../steps/SortStep";
import LimitStep from "../steps/LimitStep";

import type { NotebookStepUiComponentProps } from "../types";

export type StepUIItem = {
  title: string;
  icon?: IconName;
  priority?: number;
  transparent?: boolean;
  compact?: boolean;
  getColor: () => string;
  component: React.ComponentType<NotebookStepUiComponentProps>;
};

export const STEP_UI: Record<string, StepUIItem> = {
  data: {
    title: t`Data`,
    component: DataStep,
    getColor: () => color("brand"),
  },
  join: {
    title: t`Join data`,
    icon: "join_left_outer",
    priority: 1,
    getColor: () => color("brand"),
    component: JoinStep,
  },
  expression: {
    title: t`Custom column`,
    icon: "add_data",
    component: ExpressionStep,
    transparent: true,
    getColor: () => color("bg-dark"),
  },
  filter: {
    title: t`Filter`,
    icon: "filter",
    component: FilterStep,
    priority: 10,
    getColor: () => color("filter"),
  },
  summarize: {
    title: t`Summarize`,
    icon: "sum",
    component: SummarizeStep,
    priority: 5,
    getColor: () => color("summarize"),
  },
  aggregate: {
    title: t`Aggregate`,
    icon: "sum",
    component: AggregateStep,
    priority: 5,
    getColor: () => color("summarize"),
  },
  breakout: {
    title: t`Breakout`,
    icon: "segment",
    component: BreakoutStep,
    priority: 1,
    getColor: () => color("accent4"),
  },
  sort: {
    title: t`Sort`,
    icon: "sort",
    component: SortStep,
    compact: true,
    transparent: true,
    getColor: () => color("bg-dark"),
  },
  limit: {
    title: t`Row limit`,
    icon: "list",
    component: LimitStep,
    compact: true,
    transparent: true,
    getColor: () => color("bg-dark"),
  },
};
