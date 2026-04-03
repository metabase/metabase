import { c, t } from "ttag";

import type { MetabotLimitPeriod } from "metabase-types/api";

export const SAVE_DEBOUNCE_MS = 500;
export const MAX_LIMIT_INPUT = 999999999;

export const getLimitPeriodLabel = (limitPeriod: MetabotLimitPeriod) => {
  const nounMap: Record<MetabotLimitPeriod, string> = {
    daily: t`day`,
    weekly: t`week`,
    monthly: t`month`,
  };
  const adjectiveMap: Record<MetabotLimitPeriod, string> = {
    daily: t`daily`,
    weekly: t`weekly`,
    monthly: t`monthly`,
  };

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
