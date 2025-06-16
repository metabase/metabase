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

export const STEPS: StepDefinition[] = [
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
      return t`Connect to your data`;
    },
    icon: "database",
    visibleInSidebar: true,
  },
  {
    key: "table-selection",
    get title() {
      return t`Generate starter content`;
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
    visibleInSidebar: false,
  },
  {
    key: "final",
    get title() {
      return t`Add to your app`;
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

export const getStepIndexByKey = (key: string): number => {
  const index = STEPS.findIndex((step) => step.key === key);
  return index === -1 ? 0 : index;
};
