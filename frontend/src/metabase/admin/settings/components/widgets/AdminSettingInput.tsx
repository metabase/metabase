import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { isSettingSetFromEnvVar } from "metabase/admin/settings/settings";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useAdminSetting } from "metabase/settings";
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

type PendingWrite = { value: EnterpriseSettingValue } | null;

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
    isFetching,
    description: settingDescription,
    settingDetails,
  } = useAdminSetting(name);
  const [resetKey, setResetKey] = useState(0);
  // One write in flight at a time, holding the newest queued value. The server value
  // stays stale until the post-write refetch, so a change that reverses one still in
  // flight would compare equal to it and be dropped, and two concurrent PUTs could
  // land in either order.
  const writes = useRef<{
    inFlight: boolean;
    queued: PendingWrite;
    lastSent: PendingWrite;
  }>({ inFlight: false, queued: null, lastSent: null });
  const displayValue = settingDetails?.value ?? initialValue;

  useEffect(() => {
    // a sibling setting's refetch also ends here, so keep the sentinel while our
    // own write is unfinished
    if (!isFetching && !writes.current.inFlight) {
      writes.current.lastSent = null;
    }
  }, [isFetching]);

  const runQueue = async (value: EnterpriseSettingValue) => {
    const w = writes.current;
    w.inFlight = true;
    for (let send: PendingWrite = { value }; send; ) {
      w.lastSent = send;
      const response = await updateSetting({ key: name, value: send.value });
      if (response.error) {
        w.lastSent = null;
      }
      const next: PendingWrite =
        w.queued && w.queued.value !== send.value ? w.queued : null;
      w.queued = null;
      if (response.error && !next && inputType === "boolean") {
        // remount resets a toggle; a text input would lose what the user typed
        setResetKey((key) => key + 1);
      }
      send = next;
    }
    w.inFlight = false;
  };

  const handleChange = (newValue: EnterpriseSettingValue) => {
    const w = writes.current;
    const pending = w.queued ?? w.lastSent;
    const baseline = pending ? pending.value : displayValue;
    if (newValue === baseline) {
      return;
    }
    if (w.inFlight) {
      w.queued = { value: newValue };
    } else {
      runQueue(newValue);
    }
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
          key={resetKey}
          name={name}
          value={displayValue}
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
  if (isSettingSetFromEnvVar(settingDetails)) {
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
