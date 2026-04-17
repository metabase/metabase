import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SegmentedControl, Stack, Text, TextInput } from "metabase/ui";
import type { MetabotLimitPeriod, MetabotLimitType } from "metabase-types/api";

import S from "./GeneralLimitsSettingsSection.module.css";
import {
  useAdminSettingWithDebouncedInput,
  useInstanceLimitDebouncedInput,
} from "./hooks";
import {
  getInstanceLimitInputLabel,
  getQuotaMessageInputDescription,
  limitTypeOptions,
  resetPeriodOptions,
  sanitizeUsageLimitValue,
} from "./utils";

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
