import { useEffect, useState } from "react";
import { jt, t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import {
  Box,
  type BoxProps,
  Radio,
  Select,
  Switch,
  TextInput,
  Textarea,
} from "metabase/ui";
import type { EnterpriseSettingValue, SettingKey } from "metabase-types/api";

import { SettingHeader } from "../SettingHeader";

type OptionsInputType = "select" | "radio";
type TextualInputType = "text" | "number" | "password" | "textarea";
type BooleanInputType = "boolean";

type InputDetails =
  | {
      inputType: TextualInputType;
      options?: never;
      placeholder?: string;
    }
  | {
      inputType: OptionsInputType;
      options: { label: string; value: string }[];
      placeholder?: string;
    }
  | {
      inputType: BooleanInputType;
      options?: never;
      placeholder?: never;
    };

export type AdminSettingInputProps<S extends SettingKey> = {
  name: S;
  title?: string;
  description?: React.ReactNode;
  hidden?: boolean;
} & InputDetails &
  BoxProps;

/**
 * A simple admin settings component for basic needs, if you need something special,
 * create a special component (in the widgets/ folder) instead of building one-off
 * features into this component
 */
export function AdminSettingInput<SettingName extends SettingKey>({
  title,
  description,
  name,
  inputType,
  hidden,
  placeholder,
  options,
  ...boxProps
}: AdminSettingInputProps<SettingName>) {
  const {
    value: initialValue,
    updateSetting,
    isLoading,
    description: settingDescription,
    settingDetails,
  } = useAdminSetting(name);

  const handleChange = (newValue: EnterpriseSettingValue) => {
    if (newValue === initialValue) {
      return;
    }
    updateSetting({ key: name, value: newValue });
  };

  if (hidden || isLoading) {
    return null;
  }

  return (
    <Box data-testid={`${name}-setting`} {...boxProps}>
      <SettingHeader
        id={name}
        title={title}
        description={description ?? settingDescription}
      />
      {settingDetails?.is_env_setting && settingDetails?.env_name ? (
        <SetByEnvVar varName={settingDetails.env_name} />
      ) : (
        <BasicAdminSettingInput
          name={name}
          value={initialValue}
          onChange={handleChange}
          options={options}
          placeholder={placeholder}
          inputType={inputType}
        />
      )}
    </Box>
  );
}

export function BasicAdminSettingInput({
  name,
  value,
  onChange,
  options,
  placeholder,
  inputType,
}: {
  name: SettingKey;
  value: any;
  onChange: (newValue: string | boolean | number) => void;
  options?: { label: string; value: string }[];
  placeholder?: string;
  inputType: TextualInputType | OptionsInputType | BooleanInputType;
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
    case "textarea":
      return (
        <Textarea
          id={name}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => onChange(localValue)}
        />
      );
    case "number":
    case "password":
    case "text":
    default:
      return (
        <TextInput
          id={name}
          value={localValue}
          placeholder={placeholder}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => onChange(localValue)}
          type={inputType ?? "text"}
        />
      );
  }
}

export const SetByEnvVar = ({ varName }: { varName: string }) => {
  const { url } = useDocsUrl("configuring-metabase/environment-variables", {
    anchor: varName?.toLowerCase(),
  });

  return (
    <Box data-testid="setting-env-var-message" fw="bold" p="sm">
      {jt`This has been set by the ${(
        <ExternalLink key="link" href={url}>
          {varName}
        </ExternalLink>
      )} environment variable.`}
    </Box>
  );
};
