import { createContext } from "react";

import type { ItemContextValue, StepperContextValue } from "./types";

export const StepperContext = createContext<StepperContextValue>({
  activeStep: null,
  completedSteps: {},
  lockedSteps: {},
  stepRefs: {},
  setActiveStep: () => {},
});

export const ItemContext = createContext<ItemContextValue>({
  value: "",
  label: 0,
});
