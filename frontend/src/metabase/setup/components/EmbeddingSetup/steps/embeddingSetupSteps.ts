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
  goToStep: (key: EmbeddingSetupStepKey) => void;
  stepKey: EmbeddingSetupStepKey; // Be aware that this is sent in the `embedding_setup_step_seen` simple event
  stepIndex: number;
  totalSteps: number;
}

export const STEPS = [
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
      return t`Set up your account`;
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
    icon: "bolt_filled",
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
    key: "add-to-your-app",
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
] as const satisfies StepDefinition[];

export type EmbeddingSetupStepKey = (typeof STEPS)[number]["key"];

export const getStepIndexByKey = (key: string): number => {
  const index = STEPS.findIndex((step) => step.key === key);
  return index === -1 ? 0 : index;
};
