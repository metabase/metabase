import { t } from "ttag";

import {
  METABOT_REASONING_EFFORTS,
  type MetabotReasoningEffort,
} from "metabase-types/api";

const STORAGE_KEY = "metabot-reasoning-effort";

export const DEFAULT_REASONING_EFFORT: MetabotReasoningEffort = "medium";

export type ReasoningEffortLevel = {
  value: MetabotReasoningEffort;
  label: string;
};

export const getReasoningEffortLevels = (): ReasoningEffortLevel[] => [
  { value: "low", label: t`Low` },
  { value: "medium", label: t`Medium` },
  { value: "high", label: t`High` },
  { value: "xhigh", label: t`Extra High` },
  { value: "max", label: t`Max` },
];

const isReasoningEffort = (value: unknown): value is MetabotReasoningEffort =>
  typeof value === "string" &&
  METABOT_REASONING_EFFORTS.some((effort) => effort === value);

export const readStoredReasoningEffort = ():
  | MetabotReasoningEffort
  | undefined => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isReasoningEffort(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
};

export const writeStoredReasoningEffort = (
  value: MetabotReasoningEffort | undefined,
) => {
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage may be unavailable (private mode, quota); the in-memory value still applies
  }
};
