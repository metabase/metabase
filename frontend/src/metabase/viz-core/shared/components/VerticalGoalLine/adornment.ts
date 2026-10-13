import type { ReactNode } from "react";

export const GOAL_ADORNMENT_GAP = 4;

export type GoalAdornment = {
  content: ReactNode;
  size: number;
};

export const getGoalAdornmentWidth = (adornment: GoalAdornment | undefined) =>
  adornment != null ? GOAL_ADORNMENT_GAP + adornment.size : 0;
