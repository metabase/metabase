import { createContext } from "react";

import type { StepperContextValue } from "./types";

export const StepperContext = createContext<StepperContextValue>({
  activeStep: null,
  completedSteps: {},
  lockedSteps: {},
  stepNumbers: {},
  stepRefs: {},
  setActiveStep: () => {},
});

StepperContext.displayName = "StepperContext";
