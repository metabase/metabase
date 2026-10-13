import type { ReactNode } from "react";

export const GOAL_LABEL_OFFSET_EM = 0.2;
// visx Text's default cap height
const GOAL_LABEL_CAP_HEIGHT_EM = 0.71;
export const GOAL_ADORNMENT_GAP = 4;

export type GoalAdornment = {
  content: ReactNode;
  size: number;
};

export const getGoalAdornmentWidth = (adornment: GoalAdornment | undefined) =>
  adornment != null ? GOAL_ADORNMENT_GAP + adornment.size : 0;

// centered on the label's capitals, relative to the top of the goal line
export const getGoalAdornmentY = (labelSize: number, adornmentSize: number) =>
  -(GOAL_LABEL_OFFSET_EM + GOAL_LABEL_CAP_HEIGHT_EM / 2) * labelSize -
  adornmentSize / 2;
