import React from "react";

import type { FieldSettings } from "metabase-types/api";

import { OptionPopover } from "./OptionEditor";
import { FieldSettingsPopover } from "./FieldSettingsPopover";

import { FieldSettingsButtonsContainer } from "./FormCreator.styled";

export function FieldSettingsButtons({
  fieldSettings,
  onChange,
}: {
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}) {
  if (!fieldSettings) {
    return null;
  }

  const updateOptions = (newOptions: (string | number)[]) => {
    onChange({
      ...fieldSettings,
      valueOptions: newOptions,
    });
  };

  const hasOptions =
    fieldSettings.inputType === "select" || fieldSettings.inputType === "radio";

  return (
    <FieldSettingsButtonsContainer>
      {hasOptions && (
        <OptionPopover
          fieldType={fieldSettings.fieldType}
          options={fieldSettings.valueOptions ?? []}
          onChange={updateOptions}
        />
      )}
      <FieldSettingsPopover fieldSettings={fieldSettings} onChange={onChange} />
    </FieldSettingsButtonsContainer>
  );
}
