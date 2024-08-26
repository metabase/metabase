import type * as React from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { IconName } from "metabase/ui";

import type { NotebookStepUiComponentProps } from "../../types";
import { AggregateStep } from "../AggregateStep";
import { BreakoutStep } from "../BreakoutStep";
import { DataStep } from "../DataStep";
import { ExpressionStep } from "../ExpressionStep/ExpressionStep";
import { FilterStep } from "../FilterStep";
import { JoinStep } from "../JoinStep";
import { LimitStep } from "../LimitStep";
import { SortStep } from "../SortStep";
import { SummarizeStep } from "../SummarizeStep";

type StepUIItem = {
  title: string;
  icon?: IconName;
  priority?: number;
  transparent?: boolean;
  compact?: boolean;
  color: () => string;
  component: React.ComponentType<NotebookStepUiComponentProps>;
};

const STEP_UI: Record<string, StepUIItem> = {
  data: {
    title: t`Data`,
    component: DataStep,
    color: () => color("brand"),
  },
  join: {
    title: t`Join data`,
    icon: "join_left_outer",
    priority: 1,
    color: () => color("brand"),
    component: JoinStep,
  },
  expression: {
    title: t`Custom column`,
    icon: "add_data",
    component: ExpressionStep,
    transparent: true,
    color: () => color("bg-dark"),
  },
  filter: {
    title: t`Filter`,
    icon: "filter",
    component: FilterStep,
    priority: 10,
    color: () => color("filter"),
  },
  summarize: {
    title: t`Summarize`,
    icon: "sum",
    component: SummarizeStep,
    priority: 5,
    color: () => color("summarize"),
  },
  aggregate: {
    title: t`Aggregate`,
    icon: "sum",
    component: AggregateStep,
    priority: 5,
    color: () => color("summarize"),
  },
  breakout: {
    title: t`Breakout`,
    icon: "segment",
    component: BreakoutStep,
    priority: 1,
    color: () => color("accent4"),
  },
  sort: {
    title: t`Sort`,
    icon: "sort",
    component: SortStep,
    compact: true,
    transparent: true,
    color: () => color("bg-dark"),
  },
  limit: {
    title: t`Row limit`,
    icon: "list",
    component: LimitStep,
    compact: true,
    transparent: true,
    color: () => color("bg-dark"),
  },
};

export const getStepUIConfig = (type: string) => ({
  ...STEP_UI[type],
  color: STEP_UI[type]?.color(),
});
