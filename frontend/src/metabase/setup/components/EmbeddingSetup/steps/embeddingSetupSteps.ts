import { t } from "ttag";

import type { IconName } from "metabase/ui";

export interface StepDefinition {
  key: string;
  title: string;
  icon: IconName;
  visibleInSidebar: boolean;
}

export interface StepProps {
  nextStep: () => void;
  prevStep?: () => void;
  goToStep: (key: string) => void;
  stepKey: string;
  stepIndex: number;
  totalSteps: number;
}

export const steps: StepDefinition[] = [
  {
    key: "welcome",
    get title() {
      return t`Welcome`;
    },
    icon: "home",
    visibleInSidebar: false,
  },
  {
    key: "user-creation",
    get title() {
      return t`Create User`;
    },
    icon: "person",
    visibleInSidebar: true,
  },
  {
    key: "data-connection",
    get title() {
      return t`Connect Data`;
    },
    icon: "database",
    visibleInSidebar: true,
  },
  {
    key: "table-selection",
    get title() {
      return t`Select Tables`;
    },
    icon: "table2",
    visibleInSidebar: true,
  },
  {
    key: "processing",
    get title() {
      return t`Processing`;
    },
    icon: "gear",
    visibleInSidebar: true,
  },
  {
    key: "final",
    get title() {
      return t`Final Steps`;
    },
    icon: "check",
    visibleInSidebar: true,
  },
  {
    key: "done",
    get title() {
      return t`Done`;
    },
    icon: "check",
    visibleInSidebar: false,
  },
];

export const getStepIndexByKey = (
  steps: StepDefinition[],
  key: string,
): number => {
  const index = steps.findIndex((step) => step.key === key);
  return index === -1 ? 0 : index;
};
