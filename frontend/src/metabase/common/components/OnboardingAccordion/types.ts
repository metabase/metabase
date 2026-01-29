import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

export interface AccordionContextValue {
  completedSteps: Record<string, boolean>;
  itemRefs: Record<string, React.RefObject<HTMLDivElement>>;
}

export interface ItemContextValue {
  value: string;
  icon: IconName;
}

export interface OnboardingAccordionProps {
  children: ReactNode;

  /** Callback when the open step changes */
  onChange?: (value: string | null) => void;

  /** Record of step values to their completion status */
  completedSteps?: Record<string, boolean>;
}

export interface OnboardingAccordionItemProps {
  value: string;
  icon: IconName;
  children: ReactNode;
  "data-testid"?: string;
}

export interface OnboardingAccordionControlProps {
  children: ReactNode;
}

export interface OnboardingAccordionPanelProps {
  children: ReactNode;
}
