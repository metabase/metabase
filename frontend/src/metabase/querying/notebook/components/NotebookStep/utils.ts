import type { ComponentType } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { IconName } from "metabase/ui";

import type {
  NotebookStepHeaderProps,
  NotebookStepProps,
  NotebookStepType,
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
import { SummarizeStepHeader } from "../SummarizeStep/SummarizeStepHeader";

import { NotebookStepHeader } from "./NotebookStepHeader";

type StepUIItem = {
  title: string;
  icon?: IconName;
  priority?: number;
  secondary?: boolean;
  compact?: boolean;
  color: () => string;
  Step: ComponentType<NotebookStepProps>;
  StepHeader: ComponentType<NotebookStepHeaderProps>;
};

const STEPS: Record<NotebookStepType, StepUIItem> = {
  data: {
    title: t`Data`,
    color: () => color("brand"),
    Step: DataStep,
    StepHeader: NotebookStepHeader,
  },
  join: {
    title: t`Join data`,
    icon: "join_left_outer",
    priority: 1,
    compact: true,
    color: () => color("brand"),
    Step: JoinStep,
    StepHeader: NotebookStepHeader,
  },
  expression: {
    title: t`Custom column`,
    icon: "add_data",
    compact: true,
    secondary: true,
    color: () => color("bg-dark"),
    Step: ExpressionStep,
    StepHeader: NotebookStepHeader,
  },
  filter: {
    title: t`Filter`,
    icon: "filter",
    priority: 10,
    color: () => color("filter"),
    Step: FilterStep,
    StepHeader: NotebookStepHeader,
  },
  summarize: {
    title: t`Summarize`,
    icon: "sum",
    priority: 5,
    color: () => color("summarize"),
    Step: SummarizeStep,
    StepHeader: SummarizeStepHeader,
  },
  aggregate: {
    title: t`Aggregate`,
    icon: "sum",
    priority: 5,
    color: () => color("summarize"),
    Step: AggregateStep,
    StepHeader: NotebookStepHeader,
  },
  breakout: {
    title: t`Breakout`,
    icon: "segment",
    priority: 1,
    color: () => color("accent4"),
    Step: BreakoutStep,
    StepHeader: NotebookStepHeader,
  },
  sort: {
    title: t`Sort`,
    icon: "sort",
    compact: true,
    secondary: true,
    color: () => color("bg-dark"),
    Step: SortStep,
    StepHeader: NotebookStepHeader,
  },
  limit: {
    title: t`Row limit`,
    icon: "list",
    compact: true,
    secondary: true,
    color: () => color("bg-dark"),
    Step: LimitStep,
    StepHeader: NotebookStepHeader,
  },
};

export const getStepConfig = (type: NotebookStepType) => {
  const config = STEPS[type];

  return {
    ...config,
    color: config.color(),
  };
};
