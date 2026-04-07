import { t } from "ttag";

import type { SegmentedControlItem } from "metabase/ui";
import type { MetabotLimitPeriod, MetabotLimitType } from "metabase-types/api";

export const SAVE_DEBOUNCE_MS = 500;
export const MAX_LIMIT_INPUT = 999999999;

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

type LimitTypeOption = SegmentedControlItem<MetabotLimitType>;
type PeriodOption = SegmentedControlItem<MetabotLimitPeriod>;

export const limitTypeOptions: LimitTypeOption[] = [
  {
    value: "tokens",
    get label() {
      return t`By token usage`;
    },
  },
  {
    value: "messages",
    get label() {
      return t`By message count`;
    },
  },
];

export const resetPeriodOptions: PeriodOption[] = [
  {
    value: "daily",
    get label() {
      return t`Daily`;
    },
  },
  {
    value: "weekly",
    get label() {
      return t`Weekly`;
    },
  },
  {
    value: "monthly",
    get label() {
      return t`Monthly`;
    },
  },
];

export function getInstanceLimitInputLabel(
  limitType: MetabotLimitType = "tokens",
  limitPeriod: MetabotLimitPeriod = "monthly",
) {
  const instanceLimitLabelMap: Record<
    MetabotLimitType,
    Record<MetabotLimitPeriod, string>
  > = {
    tokens: {
      daily: t`Total daily instance limit (millions of tokens)`,
      weekly: t`Total weekly instance limit (millions of tokens)`,
      monthly: t`Total monthly instance limit (millions of tokens)`,
    },
    messages: {
      daily: t`Total daily instance limit (message count)`,
      weekly: t`Total weekly instance limit (message count)`,
      monthly: t`Total monthly instance limit (message count)`,
    },
  };

  return instanceLimitLabelMap[limitType][limitPeriod];
}

export function getQuotaMessageInputDescription(
  limitPeriod: MetabotLimitPeriod = "monthly",
) {
  const messageDescriptionMap: Record<MetabotLimitPeriod, string> = {
    daily: t`The message shown to users when they reach their daily quota.`,
    weekly: t`The message shown to users when they reach their weekly quota.`,
    monthly: t`The message shown to users when they reach their monthly quota.`,
  };

  return messageDescriptionMap[limitPeriod];
}
