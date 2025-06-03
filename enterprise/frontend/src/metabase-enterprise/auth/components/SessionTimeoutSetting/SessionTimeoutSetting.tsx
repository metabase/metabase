import { useEffect, useState } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import {
  BasicAdminSettingInput,
  SetByEnvVar,
} from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Flex, Select, Stack, Text, TextInput } from "metabase/ui";
import type { TimeoutValue } from "metabase-types/api";

const getUnits = () => [
  { value: "minutes", label: t`minutes` },
  { value: "hours", label: t`hours` },
];

const DEFAULT_VALUE = { amount: 30, unit: getUnits()[0].value };

// This should mirror the BE validation of the session-timeout setting.
const validate = (value: TimeoutValue | null) => {
  if (value === null) {
    return null;
  }

  if (value.amount <= 0) {
    return t`Timeout must be greater than 0`;
  }
  // We need to limit the duration from being too large because
  // the year of the expires date must be 4 digits (#25253)
  const unitsPerDay = { hours: 24, minutes: 24 * 60 }[value.unit] as number;
  const days = value.amount / unitsPerDay;
  const daysIn100Years = 365.25 * 100;
  if (days >= daysIn100Years) {
    return t`Timeout must be less than 100 years`;
  }
  return null;
};

export const SessionTimeoutSetting = () => {
  const {
    value: settingValue,
    updateSetting,
    updateSettingsResult,
    settingDetails,
  } = useAdminSetting("session-timeout");
  const [localValue, setLocalValue] = useState<TimeoutValue | null>(
    settingValue ?? DEFAULT_VALUE,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalValue(settingValue ?? DEFAULT_VALUE);
  }, [settingValue]);

  const handleChange = (newValue: Partial<TimeoutValue> | null) => {
    if (newValue === null) {
      setLocalValue(null);
      return null;
    } else {
      const fullValue = {
        ...DEFAULT_VALUE,
        ...localValue,
        ...newValue,
      };
      setLocalValue(fullValue);
      return fullValue;
    }
  };

  const handleSave = async (newValue: TimeoutValue | null) => {
    setError(null);
    const errorMessage = validate(newValue);

    if (!errorMessage) {
      await updateSetting({
        key: "session-timeout",
        value: newValue,
      });
    } else {
      setError(errorMessage);
    }
  };

  const handleToggle = (isEnabled: boolean) => {
    const newValue = isEnabled ? DEFAULT_VALUE : null;
    handleChange(newValue);
    handleSave(newValue);
  };

  const hasSessionTimeoutFeature = useHasTokenFeature("session_timeout_config");

  if (!hasSessionTimeoutFeature) {
    return null;
  }

  if (settingDetails?.is_env_setting && !!settingDetails.env_name) {
    return (
      <Stack gap="sm">
        <SettingHeader
          id="session-timeout"
          title={t`Session timeout`}
          description={t`Time before inactive users are logged out.`}
        />
        <SetByEnvVar varName={settingDetails.env_name} />
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <SettingHeader
        id="session-timeout"
        title={t`Session timeout`}
        description={t`Time before inactive users are logged out.`}
      />
      <BasicAdminSettingInput
        value={!!settingValue}
        disabled={updateSettingsResult.isLoading}
        name="session-timeout"
        onChange={(isEnabled) => handleToggle(Boolean(isEnabled))}
        inputType="boolean"
      />
      {!!settingValue && (
        <Flex gap="sm" mt="md">
          <TextInput
            type="number"
            data-testid="session-timeout-input"
            aria-label={t`Amount`}
            placeholder=""
            value={localValue?.amount.toString()}
            onChange={(e) => {
              handleChange({
                amount: Number(e.target.value),
              });
            }}
            onBlur={() => handleSave(localValue)}
          />
          <Select
            value={localValue?.unit}
            data={getUnits()}
            aria-label={t`Unit`}
            onChange={(newUnit: string) => {
              const newValue = handleChange({ unit: newUnit });
              handleSave(newValue);
            }}
          />
        </Flex>
      )}
      {error && (
        <Text c="error" size="sm">
          {error}
        </Text>
      )}
    </Stack>
  );
};
