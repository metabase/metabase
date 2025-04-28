import { useEffect, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Radio, Select, Stack, Switch, Text } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

import { SetByEnvVar } from "./AdminSettingInput";

const stringValue = (value: boolean): "true" | "false" => `${value}`;

export function FormattingWidget() {
  const {
    value: initialValue,
    updateSetting,
    description,
    isLoading,
    settingDetails,
  } = useAdminSetting("custom-formatting");

  if (isLoading) {
    return null;
  }

  const handleChange = (newValue: any) => {
    if (newValue === initialValue) {
      return;
    }
    updateSetting({ key: "custom-formatting", value: newValue });
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
          <Text
            component="h3"
            c="text-medium"
            fw="bold"
            tt="uppercase"
            display="block"
          >
            {t`Dates and Times`}
          </Text>

          <SettingHeader id={"date_style"} title={"title"} />

          <FormattingSettingInput
            name="date_style"
            inputType="radio"
            value={stringValue(Boolean(initialValue))}
            onChange={(newValue) => handleChange(newValue === "true")}
            options={[
              { value: "true", label: t`BCC - Hide recipients` },
              {
                value: "false",
                label: t`CC - Disclose recipients`,
              },
            ]}
          />

          <FormattingSettingInput
            name="bcc-enabled?"
            inputType="radio"
            value={stringValue(Boolean(initialValue))}
            onChange={(newValue) => handleChange(newValue === "true")}
            options={[
              { value: "true", label: t`BCC - Hide recipients` },
              {
                value: "false",
                label: t`CC - Disclose recipients`,
              },
            ]}
          />
        </Stack>
      )}
    </Stack>
  );
}

export function FormattingSettingInput({
  name,
  value,
  onChange,
  options,
  //   placeholder,
  inputType,
}: {
  name: string;
  value: any;
  onChange: (newValue: string | boolean | number) => void;
  options?: { label: string; value: string }[];
  placeholder?: string;
  inputType: "select" | "radio" | "boolean";
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string | boolean) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  switch (inputType) {
    case "select":
      return (
        <Select
          id={name}
          value={localValue}
          onChange={handleChange}
          data={options ?? []}
        />
      );

    case "boolean":
      return (
        <Switch
          id={name}
          checked={localValue}
          onChange={(e) => handleChange(e.target.checked)}
          label={localValue ? t`Enabled` : t`Disabled`}
          w="auto"
        />
      );

    case "radio":
      return (
        <Radio.Group id={name} value={localValue} onChange={handleChange}>
          {options?.map(({ label, value }) => (
            <Radio key={value} value={value} label={label} />
          ))}
        </Radio.Group>
      );
  }
}
