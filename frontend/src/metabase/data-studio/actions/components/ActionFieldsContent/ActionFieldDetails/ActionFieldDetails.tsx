import { useMemo } from "react";
import { t } from "ttag";

import { getFieldTypes, getInputTypes } from "metabase/actions/constants";
import { inputTypeHasOptions } from "metabase/actions/utils";
import { TitledSection } from "metabase/metadata/components";
import {
  Alert,
  Code,
  Icon,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";
import type { FieldSettings, FieldType } from "metabase-types/api";

import { getFieldSettingsForFieldType } from "../../../utils";
import type { ActionField } from "../hooks";

import { getDefaultValueInputType, textToOptions } from "./utils";

type ActionFieldDetailsProps = {
  field: ActionField;
  disabled: boolean;
  canChangeFieldType: boolean;
  onChange: (patch: Partial<FieldSettings>) => void;
};

export function ActionFieldDetails({
  field,
  disabled,
  canChangeFieldType,
  onChange,
}: ActionFieldDetailsProps) {
  const { settings, variableName } = field;
  const inputTypes = useMemo(
    () => getInputTypes()[settings.fieldType],
    [settings.fieldType],
  );
  const isHiddenWithoutDefault =
    settings.hidden && settings.required && settings.defaultValue == null;

  const handleFieldTypeChange = (fieldType: FieldType) => {
    onChange(getFieldSettingsForFieldType(settings, fieldType));
  };

  return (
    <Stack gap="lg" pb="xl" data-testid="action-field-details">
      <TitledSection>
        <BlurTextInput
          label={t`Display name`}
          value={settings.title}
          disabled={disabled}
          onChange={(title) => onChange({ title })}
        />
        <BlurTextarea
          label={t`Description`}
          value={settings.description ?? ""}
          disabled={disabled}
          onChange={(description) => onChange({ description })}
        />
        <Stack gap="xs">
          <Text fw="bold">{t`SQL variable`}</Text>
          <Code w="fit-content">{`{{${variableName}}}`}</Code>
        </Stack>
      </TitledSection>
      <TitledSection>
        <Stack gap="xs">
          <Text fw="bold">{t`Field type`}</Text>
          <Text c="text-secondary" size="sm">
            {t`What kind of value this field takes`}
          </Text>
          <SegmentedControl
            w="fit-content"
            value={settings.fieldType}
            data={getFieldTypes().map(({ value, name }) => ({
              value,
              label: name,
            }))}
            disabled={disabled || !canChangeFieldType}
            onChange={(value) => {
              const fieldType = getFieldTypes().find(
                (option) => option.value === value,
              )?.value;
              if (fieldType != null) {
                handleFieldTypeChange(fieldType);
              }
            }}
          />
        </Stack>
        <Select
          label={t`Input type`}
          value={settings.inputType}
          data={inputTypes.map(({ value, name }) => ({ value, label: name }))}
          disabled={disabled}
          allowDeselect={false}
          onChange={(value) => {
            const inputType = inputTypes.find(
              (option) => option.value === value,
            )?.value;
            if (inputType != null) {
              onChange({ inputType });
            }
          }}
        />
        {inputTypeHasOptions(settings.inputType) && (
          <BlurTextarea
            label={t`Options`}
            description={t`One option per line`}
            value={(settings.valueOptions ?? []).join("\n")}
            disabled={disabled}
            onChange={(value) =>
              onChange({
                valueOptions: textToOptions(value, settings.fieldType),
              })
            }
          />
        )}
        <BlurTextInput
          label={t`Placeholder`}
          value={settings.placeholder ?? ""}
          disabled={disabled}
          onChange={(placeholder) => onChange({ placeholder })}
        />
        <BlurTextInput
          label={t`Default value`}
          placeholder={t`No default`}
          type={getDefaultValueInputType(settings.inputType)}
          value={
            settings.defaultValue != null ? String(settings.defaultValue) : ""
          }
          disabled={disabled}
          onChange={(value) =>
            onChange({
              defaultValue: parseDefaultValue(value, settings.fieldType),
            })
          }
        />
      </TitledSection>
      <TitledSection>
        <Switch
          label={t`Required`}
          description={t`People must fill in this field to run the action`}
          checked={settings.required}
          disabled={disabled}
          onChange={(event) =>
            onChange({ required: event.currentTarget.checked })
          }
        />
        <Switch
          label={t`Show field`}
          description={t`Hidden fields use their default value`}
          checked={!settings.hidden}
          disabled={disabled}
          onChange={(event) =>
            onChange({ hidden: !event.currentTarget.checked })
          }
        />
        {isHiddenWithoutDefault && (
          <Alert color="warning" icon={<Icon name="warning" />}>
            {t`Your action has a hidden required field with no default value. There's a good chance this will cause the action to fail.`}
          </Alert>
        )}
      </TitledSection>
    </Stack>
  );
}

function parseDefaultValue(
  value: string,
  fieldType: FieldType,
): FieldSettings["defaultValue"] {
  if (value.trim() === "") {
    return undefined;
  }
  if (fieldType === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return value;
}

type BlurInputProps = {
  label: string;
  description?: string;
  placeholder?: string;
  type?: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function BlurTextInput({ value, onChange, ...props }: BlurInputProps) {
  return (
    <TextInput
      {...props}
      key={value}
      defaultValue={value}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) {
          onChange(event.currentTarget.value);
        }
      }}
    />
  );
}

function BlurTextarea({ value, onChange, ...props }: BlurInputProps) {
  return (
    <Textarea
      {...props}
      key={value}
      defaultValue={value}
      autosize
      minRows={2}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) {
          onChange(event.currentTarget.value);
        }
      }}
    />
  );
}
