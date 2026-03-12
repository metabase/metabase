import { useEffect, useState } from "react";
import { jt, t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import {
  Box,
  type BoxProps,
  Radio,
  Select,
  Stack,
  Switch,
  TextInput,
  type TextProps,
  Textarea,
} from "metabase/ui";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  SettingDefinition,
  SettingKey,
} from "metabase-types/api";

import { SettingHeader } from "../SettingHeader";

type SelectInputType = "select";
type RadioInputType = "radio";
type TextualInputType = "text" | "number" | "password" | "textarea";
type BooleanInputType = "boolean";

type InputDetails =
  | {
      inputType: TextualInputType;
      options?: never;
      placeholder?: string;
      searchable?: never;
    }
  | {
      inputType: SelectInputType;
      options: { label: string; value: string }[];
      placeholder?: string;
      searchable?: boolean;
    }
  | {
      inputType: RadioInputType;
      options: { label: string; value: string }[];
      placeholder?: string;
      searchable?: never;
    }
  | {
      inputType: BooleanInputType;
      options?: never;
      placeholder?: never;
      searchable?: never;
    };

export type AdminSettingInputProps<S extends EnterpriseSettingKey> = {
  name: S;
  title?: string;
  titleProps?: TextProps;
  description?: React.ReactNode;
  hidden?: boolean;
  disabled?: boolean;
  switchLabel?: React.ReactNode;
} & InputDetails &
  BoxProps;

/**
 * A simple admin settings component for basic needs, if you need something special,
 * create a special component (in the widgets/ folder) instead of building one-off
 * features into this component
 */
export function AdminSettingInput<SettingName extends EnterpriseSettingKey>({
  title,
  titleProps,
  description,
  name,
  inputType,
  hidden,
  placeholder,
  switchLabel,
  options,
  disabled,
  searchable,
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
        titleProps={titleProps}
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
          switchLabel={switchLabel}
          searchable={searchable}
          disabled={disabled}
        />
      )}
    </Box>
  );
}

export function BasicAdminSettingInput({
  name,
  value,
  disabled,
  onChange,
  options,
  placeholder,
  inputType,
  autoFocus,
  switchLabel,
  searchable,
}: {
  name: EnterpriseSettingKey;
  value: any;
  onChange: (newValue: string | boolean | number) => void;
  disabled?: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
  autoFocus?: boolean;
  switchLabel?: React.ReactNode;
  inputType:
    | TextualInputType
    | SelectInputType
    | RadioInputType
    | BooleanInputType;
  searchable?: boolean;
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
          value={localValue === null ? "" : localValue}
          onChange={handleChange}
          data={options ?? []}
          disabled={disabled}
          searchable={searchable}
        />
      );
    case "boolean":
      return (
        <Switch
          id={name}
          checked={localValue}
          onChange={(e) => handleChange(e.target.checked)}
          label={switchLabel ?? (localValue ? t`Enabled` : t`Disabled`)}
          w="auto"
          size="sm"
          disabled={disabled}
        />
      );
    case "radio":
      return (
        <Radio.Group
          id={name}
          value={String(localValue)}
          onChange={(newValue) => {
            if (options && hasBooleanOptions(options)) {
              // convert the value to boolean in the special case where a radio only has values "true" and "false"
              // this occurs when the backend value is a boolean but the UI wants to show radio inputs
              // e.g. bcc-enabled? setting in EmailSettingsPage
              handleChange(stringToBoolean(newValue));
            } else {
              handleChange(newValue);
            }
          }}
        >
          <Stack gap="sm">
            {options?.map(({ label, value }) => (
              <Radio key={value} value={value} label={label} />
            ))}
          </Stack>
        </Radio.Group>
      );
    case "textarea":
      return (
        <Textarea
          id={name}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => onChange(localValue)}
          disabled={disabled}
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
          disabled={disabled}
          autoFocus={autoFocus}
        />
      );
  }
}

function hasBooleanOptions(options: { label: string; value: string }[]) {
  return (
    options.length === 2 &&
    options.find(({ value }) => value === "true") &&
    options.find(({ value }) => value === "false")
  );
}

function stringToBoolean(value: string): boolean | string {
  return value === "true";
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

type SetByEnvVarWrapperProps<S extends EnterpriseSettingKey> = {
  settingKey: S;
  settingDetails: SettingDefinition<S> | undefined;
  children: React.ReactNode;
};

export function SetByEnvVarWrapper<SettingName extends SettingKey>({
  settingKey,
  settingDetails,
  children,
}: SetByEnvVarWrapperProps<SettingName>) {
  if (
    settingDetails &&
    settingDetails?.is_env_setting &&
    settingDetails?.env_name
  ) {
    return (
      <Box mb="lg">
        <SettingHeader
          id={settingKey}
          title={settingDetails.display_name}
          description={settingDetails.description}
        />
        <SetByEnvVar varName={settingDetails.env_name} />
      </Box>
    );
  }
  return children;
}
