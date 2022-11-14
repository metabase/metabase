import React, { useState, useEffect } from "react";
import { t } from "ttag";

import type { Parameter } from "metabase-types/types/Parameter";
import type { ActionFormSettings, FieldSettings } from "metabase-types/api";

import { FieldSettingsPopover } from "./FieldSettingsPopover";
import { getDefaultFormSettings, getDefaultFieldSettings } from "./utils";
import { FormField } from "./FormField";
import { OptionEditor } from "./OptionEditor";

import { EmptyFormPlaceholder } from "./EmptyFormPlaceholder";

import {
  FormItemWrapper,
  FormCreatorWrapper,
  FormItemName,
  FormSettings,
  FormSettingsPreviewContainer,
  EditButton,
} from "./FormCreator.styled";

export function FormCreator({
  params,
  formSettings: passedFormSettings,
  onChange,
  onExampleClick,
}: {
  params: Parameter[];
  formSettings?: ActionFormSettings;
  onChange: (formSettings: ActionFormSettings) => void;
  onExampleClick: () => void;
}) {
  const [formSettings, setFormSettings] = useState<ActionFormSettings>(
    passedFormSettings?.fields ? passedFormSettings : getDefaultFormSettings(),
  );

  useEffect(() => {
    onChange(formSettings);
  }, [formSettings, onChange]);

  const handleChangeFieldSettings = (
    paramId: string,
    newFieldSettings: FieldSettings,
  ) => {
    setFormSettings({
      ...formSettings,
      fields: {
        ...formSettings.fields,
        [paramId]: newFieldSettings,
      },
    });
  };

  return (
    <FormCreatorWrapper>
      {params.map(param => (
        <FormItem
          key={param.id}
          param={param}
          fieldSettings={
            formSettings.fields?.[param.id] ?? getDefaultFieldSettings()
          }
          onChange={(newSettings: FieldSettings) =>
            handleChangeFieldSettings(param.id, newSettings)
          }
        />
      ))}
      {!params.length && (
        <EmptyFormPlaceholder onExampleClick={onExampleClick} />
      )}
    </FormCreatorWrapper>
  );
}

function FormItem({
  param,
  fieldSettings,
  onChange,
}: {
  param: Parameter;
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}) {
  const [isEditingOptions, setIsEditingOptions] = useState(false);
  const name = param.name;

  const updateOptions = (newOptions: (string | number)[]) => {
    onChange({
      ...fieldSettings,
      valueOptions: newOptions,
    });
    setIsEditingOptions(false);
  };

  const hasOptions =
    fieldSettings.inputType === "dropdown" ||
    fieldSettings.inputType === "radio";

  return (
    <FormItemWrapper>
      <FormItemName>{name}</FormItemName>
      <FormSettings>
        <FormSettingsPreviewContainer>
          {isEditingOptions && hasOptions ? (
            <OptionEditor
              options={fieldSettings.valueOptions ?? []}
              onChange={updateOptions}
            />
          ) : (
            <FormField param={param} fieldSettings={fieldSettings} />
          )}
          {!isEditingOptions && hasOptions && (
            <EditButton
              onClick={() => setIsEditingOptions(true)}
              borderless
              small
            >
              {t`Edit options`}
            </EditButton>
          )}
        </FormSettingsPreviewContainer>
        <FieldSettingsPopover
          fieldSettings={fieldSettings}
          onChange={onChange}
        />
      </FormSettings>
    </FormItemWrapper>
  );
}
