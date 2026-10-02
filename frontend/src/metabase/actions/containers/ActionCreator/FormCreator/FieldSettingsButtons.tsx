import { Flex } from "metabase/ui";
import type { FieldSettings } from "metabase-types/api";

import { FieldSettingsPopover } from "./FieldSettingsPopover";
import { OptionPopover } from "./OptionEditor";

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
    <Flex align="center" gap="sm">
      {hasOptions && (
        <OptionPopover
          fieldType={fieldSettings.fieldType}
          options={fieldSettings.valueOptions ?? []}
          onChange={updateOptions}
        />
      )}
      <FieldSettingsPopover fieldSettings={fieldSettings} onChange={onChange} />
    </Flex>
  );
}
