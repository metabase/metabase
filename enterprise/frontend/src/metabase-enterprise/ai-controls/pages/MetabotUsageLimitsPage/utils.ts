import { c, t } from "ttag";

import type { MetabotLimitPeriod } from "metabase-types/api";

export const SAVE_DEBOUNCE_MS = 500;
export const MAX_LIMIT_INPUT = 999999999;

const nounMap: Record<MetabotLimitPeriod, string> = {
  get daily() {
    return t`day`;
  },
  get weekly() {
    return t`week`;
  },
  get monthly() {
    return t`month`;
  },
};

const adjectiveMap: Record<MetabotLimitPeriod, string> = {
  get daily() {
    return t`daily`;
  },
  get weekly() {
    return t`weekly`;
  },
  get monthly() {
    return t`monthly`;
  },
};

export const getLimitPeriodLabel = (
  limitPeriod: MetabotLimitPeriod = "monthly",
) => {
  return {
    noun: nounMap[limitPeriod],
    adjective: adjectiveMap[limitPeriod],
    i18nContext: {
      noun: c(
        "{0} indicates the limit reset period (as noun), e.g., day, week, month",
      ),
      adjective: c(
        "{0} indicates the limit reset period (as adjective), e.g., daily, weekly, monthly",
      ),
    },
  };
};

/**
 * Sanitizes the input value for a usage limit.
 * Return an integer value or null if the input is empty.
 */
export const sanitizeUsageLimitValue = (inputValue: string) => {
  let sanitizedStrValue = inputValue.trim();

  if (sanitizedStrValue !== "") {
    sanitizedStrValue = Math.min(
      Number(inputValue),
      MAX_LIMIT_INPUT,
    ).toString();
  }

  return sanitizedStrValue ? parseInt(sanitizedStrValue) : null;
};
