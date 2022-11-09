import React, { useState, useEffect } from "react";
import { t } from "ttag";

import type { TemplateTag } from "metabase-types/types/Query";
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
  tags,
  formSettings: passedFormSettings,
  onChange,
  onExampleClick,
}: {
  tags: TemplateTag[];
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
    tagId: string,
    newFieldSettings: FieldSettings,
  ) => {
    setFormSettings({
      ...formSettings,
      fields: {
        ...formSettings.fields,
        [tagId]: newFieldSettings,
      },
    });
  };

  return (
    <FormCreatorWrapper>
      {tags.map(tag => (
        <FormItem
          key={tag.id}
          tag={tag}
          fieldSettings={
            formSettings.fields?.[tag.id] ?? getDefaultFieldSettings()
          }
          onChange={(newSettings: FieldSettings) =>
            handleChangeFieldSettings(tag.id, newSettings)
          }
        />
      ))}
      {!tags.length && <EmptyFormPlaceholder onExampleClick={onExampleClick} />}
    </FormCreatorWrapper>
  );
}

function FormItem({
  tag,
  fieldSettings,
  onChange,
}: {
  tag: TemplateTag;
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}) {
  const [isEditingOptions, setIsEditingOptions] = useState(false);
  const name = tag.name;

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
            <FormField tag={tag} fieldSettings={fieldSettings} />
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
