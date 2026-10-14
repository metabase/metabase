import {
  GOAL_WARNING_GAP,
  GOAL_WARNING_ICON_SIZE,
} from "../../../lib/goal-warning";

export const GOAL_LABEL_OFFSET_EM = 0.2;
// visx Text's default cap height
const GOAL_LABEL_CAP_HEIGHT_EM = 0.71;

export const GOAL_WARNING_WIDTH = GOAL_WARNING_GAP + GOAL_WARNING_ICON_SIZE;

// centered on the label's capitals, relative to the top of the goal line
export const getGoalWarningY = (labelSize: number) =>
  -(GOAL_LABEL_OFFSET_EM + GOAL_LABEL_CAP_HEIGHT_EM / 2) * labelSize -
  GOAL_WARNING_ICON_SIZE / 2;
