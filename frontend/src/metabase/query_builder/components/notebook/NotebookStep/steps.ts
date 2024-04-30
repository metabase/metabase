import type * as React from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { IconName } from "metabase/ui";
import type { CardType } from "metabase-types/api";

import { AggregateStep } from "../steps/AggregateStep";
import BreakoutStep from "../steps/BreakoutStep";
import { DataStep } from "../steps/DataStep";
import { ExpressionStep } from "../steps/ExpressionStep";
import { FilterStep } from "../steps/FilterStep";
import { JoinStep } from "../steps/JoinStep";
import { LimitStep } from "../steps/LimitStep";
import SortStep from "../steps/SortStep";
import SummarizeStep from "../steps/SummarizeStep";
import type { NotebookStepUiComponentProps } from "../types";

export type StepUIItem = {
  getTitle: (type: CardType) => string;
  icon?: IconName;
  priority?: number;
  transparent?: boolean;
  compact?: boolean;
  color: string;
  component: React.ComponentType<NotebookStepUiComponentProps>;
};

export const STEP_UI: Record<string, StepUIItem> = {
  data: {
    getTitle: () => t`Data`,
    component: DataStep,
    color: color("brand"),
  },
  join: {
    getTitle: () => t`Join data`,
    icon: "join_left_outer",
    priority: 1,
    color: color("brand"),
    component: JoinStep,
  },
  expression: {
    getTitle: () => t`Custom column`,
    icon: "add_data",
    component: ExpressionStep,
    transparent: true,
    color: color("bg-dark"),
  },
  filter: {
    getTitle: type => (type === "metric" ? t`Filter (optional)` : t`Filter`),
    icon: "filter",
    component: FilterStep,
    priority: 10,
    color: color("filter"),
  },
  summarize: {
    getTitle: type =>
      type === "metric" ? t`Measure calculation` : t`Summarize`,
    icon: "sum",
    component: SummarizeStep,
    priority: 5,
    color: color("summarize"),
  },
  aggregate: {
    getTitle: () => t`Aggregate`,
    icon: "sum",
    component: AggregateStep,
    priority: 5,
    color: color("summarize"),
  },
  breakout: {
    getTitle: () => t`Breakout`,
    icon: "segment",
    component: BreakoutStep,
    priority: 1,
    color: color("accent4"),
  },
  sort: {
    getTitle: () => t`Sort`,
    icon: "sort",
    component: SortStep,
    compact: true,
    transparent: true,
    color: color("bg-dark"),
  },
  limit: {
    getTitle: () => t`Row limit`,
    icon: "list",
    component: LimitStep,
    compact: true,
    transparent: true,
    color: color("bg-dark"),
  },
};
