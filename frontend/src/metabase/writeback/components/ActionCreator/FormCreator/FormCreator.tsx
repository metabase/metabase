import React, { useState, useEffect } from "react";
import { t } from "ttag";

import type { TemplateTag } from "metabase-types/types/Query";
import type { ActionFormSettings, FieldSettings } from "metabase-types/api";

import { FieldSettingsPopover } from "./FieldSettingsPopover";
import { getDefaultFormSettings, getDefaultFieldSettings } from "./utils";
import { FormField } from "./FormField";

import {
  FormItemWrapper,
  FormCreatorWrapper,
  FormItemName,
  FormSettings,
  EmptyFormPlaceholderWrapper,
} from "./FormCreator.styled";

export function FormCreator({
  tags,
  formSettings: passedFormSettings,
  onChange,
}: {
  tags: TemplateTag[];
  formSettings?: ActionFormSettings;
  onChange: (formSettings: ActionFormSettings) => void;
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
      {!tags.length && <EmptyFormPlaceholder />}
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
  const name = tag.name;
  return (
    <FormItemWrapper>
      <FormItemName>{name}</FormItemName>
      <FormSettings>
        <FormField type={fieldSettings.inputType} />
        <FieldSettingsPopover
          fieldSettings={fieldSettings}
          onChange={onChange}
        />
      </FormSettings>
    </FormItemWrapper>
  );
}

function EmptyFormPlaceholder() {
  return (
    <EmptyFormPlaceholderWrapper>
      <img src="/app/assets/img/metabot.svg" />
      <p>{t`To start creating a form, write your query on the left with {{ parameter_names }}.`}</p>
      <p>{t`They'll show up as form fields here`}</p>
    </EmptyFormPlaceholderWrapper>
  );
}
