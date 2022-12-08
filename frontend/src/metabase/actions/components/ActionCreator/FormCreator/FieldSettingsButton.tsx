import React from "react";

import type { FieldSettings } from "metabase-types/api";

import { OptionPopover } from "./OptionEditor";
import { FieldSettingsPopover } from "./FieldSettingsPopover";

import { FieldSettingsButtons } from "./FormCreator.styled";

export function FieldSettingsButton({
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
    <FieldSettingsButtons>
      {hasOptions && (
        <OptionPopover
          options={fieldSettings.valueOptions ?? []}
          onChange={updateOptions}
        />
      )}
      <FieldSettingsPopover fieldSettings={fieldSettings} onChange={onChange} />
    </FieldSettingsButtons>
  );
}
