import { createContext } from "react";

import type { ItemContextValue, StepperContextValue } from "./types";

export const StepperContext = createContext<StepperContextValue>({
  activeStep: null,
  completedSteps: {},
  lockedSteps: {},
  stepNumbers: {},
  stepRefs: {},
  setActiveStep: () => {},
});

export const ItemContext = createContext<ItemContextValue>({
  stepId: "",
});
