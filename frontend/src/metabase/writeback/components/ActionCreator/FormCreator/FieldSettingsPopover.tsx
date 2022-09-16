import React, { useMemo } from "react";
import { t } from "ttag";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import type { FieldSettings, FieldType, InputType } from "metabase-types/api";

import Input from "metabase/core/components/Input";
import Radio from "metabase/core/components/Radio";
import Icon from "metabase/components/Icon";

import { getFieldTypes, getInputTypes } from "./constants";
import {
  SettingsPopoverBody,
  SectionLabel,
  Divider,
} from "./FieldSettingsPopover.styled";

export function FieldSettingsPopover({
  fieldSettings,
  onChange,
}: {
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}) {
  return (
    <TippyPopoverWithTrigger
      placement="bottom-end"
      triggerContent={<Icon name="gear" size={16} />}
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

  const handleUpdateInputType = (newInputType: InputType) =>
    onChange({
      ...fieldSettings,
      inputType: newInputType,
    });

  const handleUpdatePlaceholder = (newPlaceholder: string) =>
    onChange({
      ...fieldSettings,
      placeholder: newPlaceholder,
    });

  const hasPlaceholder =
    fieldSettings.fieldType !== "date" &&
    fieldSettings.inputType !== "inline-select";

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
  value: InputType;
  fieldType: FieldType;
  onChange: (newInputType: InputType) => void;
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
  const inputTypes = useMemo(getInputTypes, []);

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
