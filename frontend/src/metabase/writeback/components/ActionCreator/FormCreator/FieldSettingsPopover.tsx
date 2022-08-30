import React from "react";
import { t } from "ttag";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { FieldSettings, FieldType, InputType } from "metabase/writeback/types";

import Radio from "metabase/core/components/Radio";
import Icon from "metabase/components/Icon";

import { fieldTypes, inputTypes } from "./constants";
import {
  SettingsPopoverBody,
  SectionLabel,
  FieldTypeWrapper,
} from "./FieldSettingsPopover.styled";

export function FieldSettingsPopover({
  fieldSettings,
  onChange,
}: {
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: any) => void;
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
  const updateFieldType = (newFieldType: FieldType) =>
    onChange({
      ...fieldSettings,
      fieldType: newFieldType,
    });

  const updateInputType = (newInputType: InputType) =>
    onChange({
      ...fieldSettings,
      inputType: newInputType,
    });

  return (
    <SettingsPopoverBody data-testid="field-settings-popover">
      <FieldTypeSelect
        value={fieldSettings.fieldType}
        onChange={updateFieldType}
      />
      <InputTypeSelect
        value={fieldSettings.inputType}
        fieldType={fieldSettings.fieldType}
        onChange={updateInputType}
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
  return (
    <FieldTypeWrapper>
      <SectionLabel>{t`Field type`}</SectionLabel>
      <Radio
        variant="bubble"
        value={value}
        options={fieldTypes}
        onChange={onChange}
      />
    </FieldTypeWrapper>
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
  return (
    <Radio
      vertical
      value={value}
      options={inputTypes[fieldType ?? "text"]}
      onChange={onChange}
    />
  );
}
