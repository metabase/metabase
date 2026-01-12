import type { ComponentType } from "react";
import { t } from "ttag";

import type { ColorName } from "metabase/lib/colors/types";
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
  color: () => ColorName;
  Step: ComponentType<NotebookStepProps>;
  StepHeader: ComponentType<NotebookStepHeaderProps>;
};

const STEPS: Record<NotebookStepType, StepUIItem> = {
  data: {
    get title() {
      return t`Data`;
    },
    color: () => "brand",
    Step: DataStep,
    StepHeader: NotebookStepHeader,
  },
  join: {
    get title() {
      return t`Join data`;
    },
    icon: "join_left_outer",
    priority: 1,
    compact: true,
    color: () => "brand",
    Step: JoinStep,
    StepHeader: NotebookStepHeader,
  },
  expression: {
    get title() {
      return t`Custom column`;
    },
    icon: "add_data",
    compact: true,
    secondary: true,
    color: () => "text-tertiary",
    Step: ExpressionStep,
    StepHeader: NotebookStepHeader,
  },
  filter: {
    get title() {
      return t`Filter`;
    },
    icon: "filter",
    priority: 10,
    color: () => "filter",
    Step: FilterStep,
    StepHeader: NotebookStepHeader,
  },
  summarize: {
    get title() {
      return t`Summarize`;
    },
    icon: "sum",
    priority: 5,
    color: () => "summarize",
    Step: SummarizeStep,
    StepHeader: SummarizeStepHeader,
  },
  aggregate: {
    get title() {
      return t`Aggregate`;
    },
    icon: "sum",
    priority: 5,
    color: () => "summarize",
    Step: AggregateStep,
    StepHeader: NotebookStepHeader,
  },
  breakout: {
    get title() {
      return t`Breakout`;
    },
    icon: "segment",
    priority: 1,
    color: () => "accent4",
    Step: BreakoutStep,
    StepHeader: NotebookStepHeader,
  },
  sort: {
    get title() {
      return t`Sort`;
    },
    icon: "sort",
    compact: true,
    secondary: true,
    color: () => "text-tertiary",
    Step: SortStep,
    StepHeader: NotebookStepHeader,
  },
  limit: {
    get title() {
      return t`Row limit`;
    },
    icon: "list",
    compact: true,
    secondary: true,
    color: () => "text-tertiary",
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
