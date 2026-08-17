import type { MetabotContextUsage } from "../state/types";

export const isValidContextUsage = (
  contextUsage: MetabotContextUsage | undefined,
): contextUsage is MetabotContextUsage =>
  contextUsage != null &&
  Number.isFinite(contextUsage.contextTokens) &&
  Number.isFinite(contextUsage.contextWindowTokens) &&
  contextUsage.contextTokens > 0 &&
  contextUsage.contextWindowTokens > 0;

/** Share of the model's context window the conversation occupies, 0-100. */
export const getContextWindowPercentUsage = (
  contextUsage: MetabotContextUsage | undefined,
): number =>
  isValidContextUsage(contextUsage)
    ? Math.min(
        100,
        (contextUsage.contextTokens / contextUsage.contextWindowTokens) * 100,
      )
    : 0;
