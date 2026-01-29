import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

export interface StepperContextValue {
  activeStep: string | null;
  completedSteps: Record<string, boolean>;
  stepRefs: Record<string, React.RefObject<HTMLDivElement>>;
  setActiveStep: (value: string | null) => void;
}

export interface ItemContextValue {
  value: string;
  label: number;
  icon?: IconName;
}

export interface OnboardingStepperProps {
  children: ReactNode;

  /** Callback when the active step changes */
  onChange?: (value: string | null) => void;

  /** Record of step values to their completion status */
  completedSteps?: Record<string, boolean>;
}

export interface OnboardingStepperStepProps {
  /** Unique identifier for this step */
  value: string;

  /** Step number to display in the badge */
  label: number;

  /** Title displayed in the step header */
  title: string;

  /** Optional icon for inactive state (defaults to showing the label number) */
  icon?: IconName;

  /** Content to show when the step is active */
  children: ReactNode;

  "data-testid"?: string;
}
