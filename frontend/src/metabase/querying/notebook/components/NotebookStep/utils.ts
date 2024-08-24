import type { ComponentType } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { IconName } from "metabase/ui";
import type { CardType } from "metabase-types/api";

import type {
  NotebookStepType,
  NotebookStepUiComponentProps,
} from "../../types";
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
  title: { base: string } & Partial<Record<CardType, string>>;
  icon?: IconName;
  priority?: number;
  transparent?: boolean;
  compact?: boolean;
  color: () => string;
  component: ComponentType<NotebookStepUiComponentProps>;
};

const STEPS: Record<NotebookStepType, StepUIItem> = {
  data: {
    title: { base: t`Data` },
    component: DataStep,
    color: () => color("brand"),
  },
  join: {
    title: { base: t`Join data` },
    icon: "join_left_outer",
    priority: 1,
    color: () => color("brand"),
    component: JoinStep,
  },
  expression: {
    title: { base: t`Custom column` },
    icon: "add_data",
    component: ExpressionStep,
    transparent: true,
    color: () => color("bg-dark"),
  },
  filter: {
    title: { base: t`Filter` },
    icon: "filter",
    component: FilterStep,
    priority: 10,
    color: () => color("filter"),
  },
  summarize: {
    title: { base: t`Summarize`, metric: t`Formula` },
    icon: "sum",
    component: SummarizeStep,
    priority: 5,
    color: () => color("summarize"),
  },
  aggregate: {
    title: { base: t`Aggregate` },
    icon: "sum",
    component: AggregateStep,
    priority: 5,
    color: () => color("summarize"),
  },
  breakout: {
    title: { base: t`Breakout` },
    icon: "segment",
    component: BreakoutStep,
    priority: 1,
    color: () => color("accent4"),
  },
  sort: {
    title: { base: t`Sort` },
    icon: "sort",
    component: SortStep,
    compact: true,
    transparent: true,
    color: () => color("bg-dark"),
  },
  limit: {
    title: { base: t`Row limit` },
    icon: "list",
    component: LimitStep,
    compact: true,
    transparent: true,
    color: () => color("bg-dark"),
  },
};

export const getStepConfig = (
  stepType: NotebookStepType,
  cardType: CardType,
) => {
  const stepConfig = STEPS[stepType];

  return {
    ...stepConfig,
    title: stepConfig.title[cardType] ?? stepConfig.title.base,
    color: stepConfig.color(),
  };
};
