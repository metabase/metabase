/**
 * Finds the next incomplete and unlocked step starting from a given index.
 * Falls back to the last step when all remaining steps are complete,
 * ensuring summary/final steps can be reached.
 */
export const getNextStepToActivate = ({
  fromIndex = 0,

  stepIds,
  completedSteps,
  lockedSteps = {},
}: {
  fromIndex?: number;

  stepIds: string[];
  completedSteps: Record<string, boolean>;
  lockedSteps?: Record<string, boolean>;
}): string | null =>
  stepIds
    .slice(fromIndex)
    .find((id) => !completedSteps[id] && !lockedSteps?.[id]) ??
  stepIds[stepIds.length - 1] ??
  null;
