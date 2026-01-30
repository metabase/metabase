import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

export interface StepperContextValue {
  activeStep: string | null;
  completedSteps: Record<string, boolean>;
  lockedSteps: Record<string, boolean>;
  stepNumbers: Record<string, number>;
  stepRefs: Record<string, React.RefObject<HTMLDivElement>>;
  setActiveStep: (stepId: string | null) => void;
}

export interface ItemContextValue {
  stepId: string;
  icon?: IconName;
}

export interface OnboardingStepperProps {
  children: ReactNode;

  /** Callback when the active step changes */
  onChange?: (value: string | null) => void;

  /** Record of step values to their completion status */
  completedSteps?: Record<string, boolean>;

  /** Record of step values to their locked status */
  lockedSteps?: Record<string, boolean>;
}

export interface OnboardingStepperStepProps {
  /** Unique identifier for this step */
  stepId: string;

  /** Title displayed in the step header */
  title: string;

  /** Optional icon for inactive state (defaults to showing the step number) */
  icon?: IconName;

  /** Content to show when the step is active */
  children: ReactNode;

  "data-testid"?: string;
}
