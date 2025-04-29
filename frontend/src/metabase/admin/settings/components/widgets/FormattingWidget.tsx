import type React from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { currency } from "cljs/metabase.util.currency";
import { useAdminSetting } from "metabase/api/utils";
import { Radio, Select, Stack, Switch, Text } from "metabase/ui";
import {
  getCurrencyStyleOptions,
  getDateStyleOptionsForUnit,
  getTimeStyleOptions,
} from "metabase/visualizations/lib/settings/column";
import type { FormattingSettings } from "metabase-types/api";

import { SettingHeader } from "../SettingHeader";

import { SetByEnvVar } from "./AdminSettingInput";

export function FormattingWidget() {
  const {
    value: initialValue,
    updateSetting,
    description,
    isLoading,
    settingDetails,
  } = useAdminSetting("custom-formatting");
  const currencyValue = "USD";
  const [localValue] = useState<FormattingSettings | undefined>(initialValue);

  if (isLoading) {
    return null;
  }

  const {
    date_style: dateStyle,
    date_abbreviate: dateAbreviate,
    time_style: timeStyle,
  } = localValue?.["type/Temporal"] || {};

  const dateStyleOptions = getDateStyleOptionsForUnit("default");

  const handleChange = (newValue: any) => {
    if (newValue === initialValue) {
      return;
    }
    updateSetting({ key: "custom-formatting", value: { ...localValue } });
  };

  return (
    <Stack data-testid="custom-formatting-setting">
      <SettingHeader
        id="custom-formatting"
        title={t`Localization options`}
        description={description}
      />
      {settingDetails?.is_env_setting && settingDetails?.env_name ? (
        <SetByEnvVar varName={settingDetails.env_name} />
      ) : (
        <Stack>
          <FormattingSection title={t`Dates and Times`}>
            <FormattingInput
              id="date_style"
              label={t`Date style`}
              value={dateStyle}
              options={dateStyleOptions ?? []}
            />
            <FormattingInput
              id="date_abbreviate"
              label={t`Abbreviate days and months`}
              value={dateAbreviate}
              inputType="boolean"
              onChange={(checked) => handleChange(checked)}
            />
            <FormattingInput
              id="time_style"
              label={t`Time style`}
              value={timeStyle}
              inputType="radio"
              options={getTimeStyleOptions("default") ?? []}
              onChange={handleChange}
            />
          </FormattingSection>
          <FormattingSection title={t`Numbers`}>
            <FormattingInput
              id="number_separators"
              label={t`Separator style`}
              value={dateStyle}
              inputType="select"
              options={[
                { label: "100,000.00", value: ".," },
                { label: "100 000,00", value: ", " },
                { label: "100.000,00", value: ",." },
                { label: "100000.00", value: "." },
                { label: "100'000.00", value: ".'" },
              ]}
              onChange={handleChange}
            />
          </FormattingSection>
          <FormattingSection title={t`Currency`}>
            <FormattingInput
              id="currency"
              label={t`Unit of currency`}
              value={dateStyle}
              inputType="select"
              options={currency.map(([, currency]) => ({
                name: currency.name,
                value: currency.code,
              }))}
              onChange={handleChange}
            />
            <FormattingInput
              id="currency_style"
              label={t`Currency label style`}
              value={dateStyle}
              inputType="radio"
              options={getCurrencyStyleOptions(currencyValue)}
              onChange={handleChange}
            />
          </FormattingSection>
        </Stack>
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
    <div>
      <Text
        htmlFor={id}
        component="label"
        c="text-medium"
        fw="bold"
        tt="uppercase"
        display="block"
      >
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
          {options?.map(({ label, value }) => (
            <Radio key={value} value={value} label={label} />
          ))}
        </Radio.Group>
      )}
    </div>
  );
}

function FormattingSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <Text
        component="h3"
        c="text-medium"
        fw="bold"
        tt="uppercase"
        display="block"
      >
        {title}
      </Text>
      {children}
    </section>
  );
}
