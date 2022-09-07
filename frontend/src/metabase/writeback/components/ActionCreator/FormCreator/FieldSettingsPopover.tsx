import React, { useMemo } from "react";
import { t } from "ttag";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import type { FieldSettings, FieldType, InputType } from "metabase-types/api";

import Radio from "metabase/core/components/Radio";
import Icon from "metabase/components/Icon";

import { getFieldTypes, getInputTypes } from "./constants";
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
  const handleUpdateFieldType = (newFieldType: FieldType) =>
    onChange({
      ...fieldSettings,
      fieldType: newFieldType,
    });

  const handleUpdateInputType = (newInputType: InputType) =>
    onChange({
      ...fieldSettings,
      inputType: newInputType,
    });

  return (
    <SettingsPopoverBody data-testid="field-settings-popover">
      <FieldTypeSelect
        value={fieldSettings.fieldType}
        onChange={handleUpdateFieldType}
      />
      <InputTypeSelect
        value={fieldSettings.inputType}
        fieldType={fieldSettings.fieldType}
        onChange={handleUpdateInputType}
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
  const inputTypes = useMemo(getInputTypes, []);

  return (
    <Radio
      vertical
      value={value}
      options={inputTypes[fieldType ?? "text"]}
      onChange={onChange}
    />
  );
}
