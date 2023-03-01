import React, { useMemo } from "react";
import { t } from "ttag";

import type {
  FieldSettings,
  FieldType,
  InputSettingType,
} from "metabase-types/api";

import Input from "metabase/core/components/Input";
import Radio from "metabase/core/components/Radio";
import Toggle from "metabase/core/components/Toggle";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import { isEmpty } from "metabase/lib/validate";

import { getFieldTypes, getInputTypes } from "./constants";
import {
  SettingsTriggerIcon,
  ToggleContainer,
  SettingsPopoverBody,
  SectionLabel,
  RequiredToggleLabel,
  Divider,
} from "./FieldSettingsPopover.styled";

export interface FieldSettingsPopoverProps {
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}

export function FieldSettingsPopover({
  fieldSettings,
  onChange,
}: FieldSettingsPopoverProps) {
  return (
    <TippyPopoverWithTrigger
      placement="bottom-end"
      triggerContent={
        <SettingsTriggerIcon
          name="gear"
          size={14}
          tooltip={t`Change field settings`}
          aria-label={t`Field settings`}
        />
      }
      maxWidth={400}
      popoverContent={() => (
        <FormCreatorPopoverBody
          fieldSettings={fieldSettings}
          onChange={onChange}
        />
      )}
    />
  );
}

function cleanDefaultValue(fieldType: FieldType, value?: string | number) {
  if (isEmpty(value)) {
    return;
  }

  if (fieldType === "number") {
    const clean = Number(value);
    return !Number.isNaN(clean) ? clean : 0;
  }

  return value;
}

export function FormCreatorPopoverBody({
  fieldSettings,
  onChange,
}: {
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}) {
  const inputTypes = useMemo(getInputTypes, []);

  const handleUpdateFieldType = (newFieldType: FieldType) =>
    onChange({
      ...fieldSettings,
      fieldType: newFieldType,
      inputType: inputTypes[newFieldType][0].value,
    });

  const handleUpdateInputType = (newInputType: InputSettingType) =>
    onChange({
      ...fieldSettings,
      inputType: newInputType,
    });

  const handleUpdatePlaceholder = (newPlaceholder: string) =>
    onChange({
      ...fieldSettings,
      placeholder: newPlaceholder,
    });

  const handleUpdateRequired = ({
    required,
    defaultValue,
  }: {
    required: boolean;
    defaultValue?: string | number;
  }) =>
    onChange({
      ...fieldSettings,
      required,
      defaultValue: cleanDefaultValue(fieldSettings.fieldType, defaultValue),
    });

  const hasPlaceholder =
    fieldSettings.fieldType !== "date" && fieldSettings.inputType !== "radio";

  return (
    <SettingsPopoverBody data-testid="field-settings-popover">
      <FieldTypeSelect
        value={fieldSettings.fieldType}
        onChange={handleUpdateFieldType}
      />
      <Divider />
      <InputTypeSelect
        value={fieldSettings.inputType}
        fieldType={fieldSettings.fieldType}
        onChange={handleUpdateInputType}
      />
      <Divider />
      {hasPlaceholder && (
        <PlaceholderInput
          value={fieldSettings.placeholder ?? ""}
          onChange={handleUpdatePlaceholder}
        />
      )}
      <Divider />
      <RequiredInput
        value={fieldSettings.required}
        defaultValue={fieldSettings.defaultValue}
        onChange={handleUpdateRequired}
      />
    </SettingsPopoverBody>
  );
}

function FieldTypeSelect({
  value,
  onChange,
}: {
  value: FieldType;
  onChange: (newFieldType: FieldType) => void;
}) {
  const fieldTypes = useMemo(getFieldTypes, []);

  return (
    <div>
      <SectionLabel>{t`Field type`}</SectionLabel>
      <Radio
        variant="bubble"
        value={value}
        options={fieldTypes}
        aria-label={t`Field type`}
        onChange={onChange}
      />
    </div>
  );
}

function InputTypeSelect({
  fieldType,
  value,
  onChange,
}: {
  value: InputSettingType;
  fieldType: FieldType;
  onChange: (newInputType: InputSettingType) => void;
}) {
  const inputTypes = useMemo(getInputTypes, []);

  return (
    <Radio
      vertical
      value={value}
      options={inputTypes[fieldType ?? "string"]}
      onChange={onChange}
    />
  );
}

function PlaceholderInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (newPlaceholder: string) => void;
}) {
  return (
    <div>
      <SectionLabel htmlFor="placeholder">{t`Placeholder text`}</SectionLabel>
      <Input
        id="placeholder"
        fullWidth
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

type DefaultValue = string | number;

interface RequiredInputProps {
  value: boolean;
  defaultValue?: DefaultValue;
  onChange: (values: {
    required: boolean;
    defaultValue?: DefaultValue;
  }) => void;
}

function RequiredInput({
  value: isRequired,
  defaultValue,
  onChange,
}: RequiredInputProps) {
  return (
    <div>
      <ToggleContainer>
        <RequiredToggleLabel htmlFor="is-required">{t`Required`}</RequiredToggleLabel>
        <Toggle
          id="is-required"
          value={!!isRequired}
          onChange={required => onChange({ required, defaultValue })}
        />
      </ToggleContainer>
      {isRequired && (
        <>
          <SectionLabel htmlFor="default-value">{t`Default value`}</SectionLabel>
          <Input
            id="default-value"
            fullWidth
            value={defaultValue ?? ""}
            onChange={e =>
              onChange({ required: true, defaultValue: e.target.value })
            }
          />
        </>
      )}
    </div>
  );
}
