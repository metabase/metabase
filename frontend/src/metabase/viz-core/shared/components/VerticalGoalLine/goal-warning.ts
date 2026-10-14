import { GOAL_WARNING_ICON_SIZE } from "../../../lib/goal-warning";

export const GOAL_LABEL_OFFSET_EM = 0.2;
const GOAL_LABEL_CAP_HEIGHT_EM = 0.71;

// centered on the label's capitals, relative to the top of the goal line
export function getGoalWarningY(labelSize: number) {
  return (
    -(GOAL_LABEL_OFFSET_EM + GOAL_LABEL_CAP_HEIGHT_EM / 2) * labelSize -
    GOAL_WARNING_ICON_SIZE / 2
  );
}
