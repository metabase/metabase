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

import { getInputTypes } from "./constants";
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
          size={16}
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
      <SectionLabel>{t`Placeholder text`}</SectionLabel>
      <Input
        fullWidth
        value={value}
        onChange={e => onChange(e.target.value)}
        data-testid="placeholder-input"
      />
    </div>
  );
}

function RequiredInput({
  value,
  defaultValue,
  onChange,
}: {
  value: boolean;
  defaultValue?: string | number;
  onChange: ({
    required,
    defaultValue,
  }: {
    required: boolean;
    defaultValue?: string | number;
  }) => void;
}) {
  return (
    <div>
      <ToggleContainer>
        <RequiredToggleLabel htmlFor="is-required">{t`Required`}</RequiredToggleLabel>
        <Toggle
          id="is-required"
          value={!!value}
          onChange={required => onChange({ required, defaultValue })}
        />
      </ToggleContainer>
      {!value && (
        <>
          <SectionLabel htmlFor="default-value">{t`Default value`}</SectionLabel>
          <Input
            id="default-value"
            fullWidth
            value={defaultValue ?? ""}
            onChange={e =>
              onChange({ required: false, defaultValue: e.target.value })
            }
            data-testid="placeholder-input"
          />
        </>
      )}
    </div>
  );
}
