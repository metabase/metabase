import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils";
import {
  type CurrencyStyle,
  getCurrencyOptions,
  getCurrencyStyleOptions,
  getDateStyleOptionsForUnit,
  getTimeStyleOptions,
} from "metabase/lib/formatting";
import { Box, Radio, Select, Stack, Switch, Text } from "metabase/ui";
import type { FormattingSettings } from "metabase-types/api";

import { SetByEnvVar } from "./AdminSettingInput";

const DEFAULT_FORMATTING_SETTINGS: FormattingSettings = {
  "type/Temporal": {
    date_style: "MMMM D, YYYY",
    time_style: "h:mm A",
    date_abbreviate: false,
  },
  "type/Number": {
    number_separators: ".,",
  },
  "type/Currency": {
    currency: "USD",
    currency_style: "symbol",
  },
};

const mapNameToLabel = (option: { name: string; value: any }) => ({
  label: option.name,
  value: option.value,
});

export function FormattingWidget() {
  const {
    value: initialValue,
    updateSetting,
    isLoading,
    settingDetails,
  } = useAdminSetting("custom-formatting");
  const [localValue, setLocalValue] = useState<FormattingSettings | undefined>({
    ...DEFAULT_FORMATTING_SETTINGS,
    ...initialValue,
  });

  const {
    date_style: dateStyle,
    date_abbreviate: dateAbreviate,
    time_style: timeStyle,
  } = localValue?.["type/Temporal"] || {};

  const { number_separators: numberSeparators } =
    localValue?.["type/Number"] || {};

  const { currency, currency_style: currencyStyle } =
    localValue?.["type/Currency"] || {};

  const [currencyOptions, currencyStyleOptions] = useMemo(() => {
    const currencyOptions = (
      getCurrencyOptions() as { name: string; value: string }[]
    ).map(mapNameToLabel);
    const currencyStyleOptions = getCurrencyStyleOptions(
      currency,
      currencyStyle,
    ).map(mapNameToLabel);
    return [currencyOptions, currencyStyleOptions];
  }, [currency, currencyStyle]);

  if (isLoading) {
    return null;
  }

  const dateStyleOptions = getDateStyleOptionsForUnit("default", dateAbreviate);

  const handleChange = (newValue: FormattingSettings) => {
    if (_.isEqual(newValue, localValue)) {
      return;
    }
    setLocalValue(newValue);
    updateSetting({ key: "custom-formatting", value: newValue });
  };

  return (
    <Stack data-testid="custom-formatting-setting">
      {settingDetails?.is_env_setting && settingDetails?.env_name ? (
        <SetByEnvVar varName={settingDetails.env_name} />
      ) : (
        <>
          <SettingsSection title={t`Dates and times`}>
            <FormattingInput
              id="date_style"
              label={t`Date style`}
              value={dateStyle}
              onChange={(newValue) =>
                handleChange({
                  ...localValue,
                  "type/Temporal": {
                    ...localValue?.["type/Temporal"],
                    date_style: newValue as string,
                  },
                })
              }
              inputType="select"
              options={
                dateStyleOptions.map(({ name, value }) => ({
                  label: name,
                  value,
                })) ?? []
              }
            />
            <FormattingInput
              id="date_abbreviate"
              label={t`Abbreviate days and months`}
              value={dateAbreviate}
              inputType="boolean"
              onChange={(checked) =>
                handleChange({
                  ...localValue,
                  "type/Temporal": {
                    ...localValue?.["type/Temporal"],
                    date_abbreviate: checked as boolean,
                  },
                })
              }
            />
            <FormattingInput
              id="time_style"
              label={t`Time style`}
              value={timeStyle}
              inputType="radio"
              options={
                getTimeStyleOptions("default").map(({ name, value }) => ({
                  label: name,
                  value,
                })) ?? []
              }
              onChange={(newValue) =>
                handleChange({
                  ...localValue,
                  "type/Temporal": {
                    ...localValue?.["type/Temporal"],
                    time_style: newValue as string,
                  },
                })
              }
            />
          </SettingsSection>
          <SettingsSection title={t`Numbers`}>
            <FormattingInput
              id="number_separators"
              label={t`Separator style`}
              value={numberSeparators}
              inputType="select"
              options={[
                { label: "100,000.00", value: ".," },
                { label: "100 000,00", value: ", " },
                { label: "100.000,00", value: ",." },
                { label: "100000.00", value: "." },
                { label: "100’000.00", value: ".’" },
              ]}
              onChange={(newValue) =>
                handleChange({
                  ...localValue,
                  "type/Number": {
                    ...localValue?.["type/Number"],
                    number_separators: newValue as string,
                  },
                })
              }
            />
          </SettingsSection>
          <SettingsSection title={t`Currency`}>
            <FormattingInput
              id="currency"
              label={t`Unit of currency`}
              value={currency}
              inputType="select"
              options={currencyOptions}
              onChange={(newValue) =>
                handleChange({
                  ...localValue,
                  "type/Currency": {
                    ...localValue?.["type/Currency"],
                    currency: newValue as string,
                  },
                })
              }
            />
            <FormattingInput
              id="currency_style"
              label={t`Currency label style`}
              value={currencyStyle}
              inputType="radio"
              options={currencyStyleOptions}
              onChange={(newValue) =>
                handleChange({
                  ...localValue,
                  "type/Currency": {
                    ...localValue?.["type/Currency"],
                    currency_style: newValue as CurrencyStyle,
                  },
                })
              }
            />
          </SettingsSection>
        </>
      )}
    </Stack>
  );
}

function FormattingInput({
  id,
  label,
  value,
  onChange,
  options,
  inputType,
}: {
  id: string;
  label: string;
  value: any;
  onChange: (newValue: string | boolean | number) => void;
  options?: { label: string; value: string }[];
  inputType: "boolean" | "select" | "radio";
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string | boolean) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  return (
    <Box data-testid={`${id}-formatting-setting`}>
      <Text htmlFor={id} component="label" fw="bold" display="block" mb="xs">
        {label}
      </Text>
      {inputType === "select" && (
        <Select
          id={id}
          value={localValue}
          onChange={handleChange}
          data={options ?? []}
        />
      )}
      {inputType === "boolean" && (
        <Switch
          id={id}
          checked={localValue}
          onChange={(e) => handleChange(e.target.checked)}
          label={localValue ? t`Enabled` : t`Disabled`}
          w="auto"
        />
      )}
      {inputType === "radio" && (
        <Radio.Group id={id} value={localValue} onChange={handleChange}>
          <Stack gap="sm">
            {options?.map(({ label, value }) => (
              <Radio key={value} value={value} label={label} />
            ))}
          </Stack>
        </Radio.Group>
      )}
    </Box>
  );
}
