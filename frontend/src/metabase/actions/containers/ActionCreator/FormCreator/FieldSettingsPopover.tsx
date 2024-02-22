import type { ChangeEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { getInputTypes } from "metabase/actions/constants";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Input from "metabase/core/components/Input";
import Radio from "metabase/core/components/Radio";
import Toggle from "metabase/core/components/Toggle";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import type {
  FieldSettings,
  FieldType,
  InputSettingType,
} from "metabase-types/api";

import {
  SettingsTriggerIcon,
  ToggleContainer,
  SettingsPopoverBody,
  SectionLabel,
  RequiredToggleLabel,
  Divider,
} from "./FieldSettingsPopover.styled";
import { getDefaultValueInputType } from "./utils";

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

  const handleUpdateRequired = (required: boolean) =>
    onChange({
      ...fieldSettings,
      required,
      defaultValue: undefined,
    });

  const handleUpdateDefaultValue = (
    defaultValue: string | number | undefined,
  ) =>
    onChange({
      ...fieldSettings,
      defaultValue,
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
      <Divider data-testid="divider" />
      {hasPlaceholder && (
        <>
          <PlaceholderInput
            value={fieldSettings.placeholder ?? ""}
            onChange={handleUpdatePlaceholder}
          />
          <Divider data-testid="divider" />
        </>
      )}
      <RequiredInput
        fieldSettings={fieldSettings}
        onChangeRequired={handleUpdateRequired}
        onChangeDefaultValue={handleUpdateDefaultValue}
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
  const id = useUniqueId();

  return (
    <div>
      <SectionLabel htmlFor={id}>{t`Placeholder text`}</SectionLabel>
      <Input
        id={id}
        fullWidth
        value={value}
        onChange={e => onChange(e.target.value)}
        data-testid="placeholder-input"
      />
    </div>
  );
}

interface RequiredInputProps {
  fieldSettings: FieldSettings;
  onChangeRequired: (required: boolean) => void;
  onChangeDefaultValue: (defaultValue: string | number | undefined) => void;
}

function RequiredInput({
  fieldSettings: { fieldType, inputType, required, defaultValue },
  onChangeRequired,
  onChangeDefaultValue,
}: RequiredInputProps) {
  const id = useUniqueId();

  const handleDefaultValueChange = ({
    target: { value },
  }: ChangeEvent<HTMLInputElement>) => {
    if (!value) {
      onChangeDefaultValue(undefined);
    } else if (fieldType === "number") {
      onChangeDefaultValue(Number(value));
    } else {
      onChangeDefaultValue(value);
    }
  };

  return (
    <div>
      <ToggleContainer>
        <RequiredToggleLabel
          htmlFor={`${id}-required`}
        >{t`Required`}</RequiredToggleLabel>
        <Toggle
          id={`${id}-required`}
          value={required}
          onChange={onChangeRequired}
        />
      </ToggleContainer>
      {required && (
        <>
          <SectionLabel htmlFor={`${id}-default`}>
            {t`Default value`}
          </SectionLabel>
          <Input
            id={`${id}-default`}
            type={getDefaultValueInputType(inputType)}
            fullWidth
            value={defaultValue ?? ""}
            onChange={handleDefaultValueChange}
          />
        </>
      )}
    </div>
  );
}
