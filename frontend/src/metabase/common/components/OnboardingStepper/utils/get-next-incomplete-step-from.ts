/**
 * Finds the next incomplete and unlocked step,
 * starting from a given index.
 */
export const getNextIncompleteStepFrom = ({
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
    .find((id) => !completedSteps[id] && !lockedSteps?.[id]) ?? null;
