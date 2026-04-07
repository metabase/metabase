import { useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  SegmentedControl,
  type SegmentedControlItem,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { MetabotLimitPeriod, MetabotLimitType } from "metabase-types/api";

import S from "./GeneralLimitsSettingsSection.module.css";
import { useAdminSettingWithDebouncedInput } from "./hooks/useAdminSettingWithDebouncedInput";
import { useInstanceLimitDebouncedInput } from "./hooks/useInstanceLimitDebouncedInput";
import { sanitizeUsageLimitValue } from "./utils";

type LimitTypeOption = SegmentedControlItem<MetabotLimitType>;
type PeriodOption = SegmentedControlItem<MetabotLimitPeriod>;

export function GeneralLimitsSettingsSection() {
  const { instanceLimit, handleInstanceLimitInputChange } =
    useInstanceLimitDebouncedInput();
  const { handleInputChange: handleLimitTypeChange, inputValue: limitType } =
    useAdminSettingWithDebouncedInput<MetabotLimitType>(
      "metabot-limit-unit",
      "tokens",
    );
  const {
    inputValue: limitPeriod,
    handleInputChange: handleLimitPeriodChange,
  } = useAdminSettingWithDebouncedInput<MetabotLimitPeriod>(
    "metabot-limit-reset-rate",
    "monthly",
  );
  const {
    inputValue: quotaMessage,
    handleInputChange: handleQuotaMessageChange,
  } = useAdminSettingWithDebouncedInput<string | null>(
    "metabot-quota-reached-message",
  );
  const prevLimitType = usePrevious(limitType);

  useEffect(() => {
    if (prevLimitType && limitType && limitType !== prevLimitType) {
      handleInstanceLimitInputChange(null);
    }
  }, [prevLimitType, limitType, handleInstanceLimitInputChange]);

  return (
    <SettingsSection title={t`Settings and general limits`}>
      <Stack gap="xl" align="flex-start">
        <Stack gap="sm">
          <Text fw="bold">{t`How do you want to limit AI usage?`}</Text>
          <SegmentedControl
            data={limitTypeOptions}
            classNames={{
              root: S.SegmentedControlRoot,
              label: S.Label,
            }}
            value={limitType}
            onChange={handleLimitTypeChange}
          />
        </Stack>
        <Stack gap="sm">
          <Text fw="bold">{t`When should usage limits reset?`}</Text>
          <SegmentedControl
            data={resetPeriodOptions}
            classNames={{
              root: S.SegmentedControlRoot,
              label: S.Label,
            }}
            value={limitPeriod}
            onChange={handleLimitPeriodChange}
          />
        </Stack>
        <TextInput
          label={getInstanceLimitInputLabel(
            limitType || "tokens",
            limitPeriod || "monthly",
          )}
          description={t`This is the maximum amount all users should be able to use in total.`}
          placeholder={t`Unlimited`}
          classNames={{
            input: S.InstanceTokenLimitInput,
            description: S.InputDescription,
          }}
          type="number"
          min={1}
          value={instanceLimit != null ? instanceLimit : ""}
          onChange={(e) =>
            handleInstanceLimitInputChange(
              sanitizeUsageLimitValue(e.target.value),
            )
          }
        />
        <TextInput
          label={t`Quota-reached message`}
          description={getQuotaMessageInputDescription(limitPeriod)}
          placeholder={t`You have reached your AI usage limit for the current period. Please contact your administrator.`}
          classNames={{
            input: S.QuotaMessageInput,
            description: S.InputDescription,
          }}
          value={quotaMessage || ""}
          onChange={(e) => handleQuotaMessageChange(e.target.value)}
        />
      </Stack>
    </SettingsSection>
  );
}

const limitTypeOptions: LimitTypeOption[] = [
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

const resetPeriodOptions: PeriodOption[] = [
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

function getInstanceLimitInputLabel(
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

function getQuotaMessageInputDescription(
  limitPeriod: MetabotLimitPeriod = "monthly",
) {
  const messageDescriptionMap: Record<MetabotLimitPeriod, string> = {
    daily: t`The message shown to users when they reach their daily quota.`,
    weekly: t`The message shown to users when they reach their weekly quota.`,
    monthly: t`The message shown to users when they reach their monthly quota.`,
  };

  return messageDescriptionMap[limitPeriod];
}
