import React from "react";

import Icon from "metabase/components/Icon";

import type { FieldSettings } from "metabase-types/api";

import type { ActionFormFieldProps } from "metabase/actions/types";

import { FieldSettingsButtons } from "../../containers/ActionCreator/FormCreator/FieldSettingsButtons";
import { FormFieldWidget } from "./ActionFormFieldWidget";
import {
  FormFieldContainer,
  SettingsContainer,
  InputContainer,
} from "./FormFieldEditor.styled";

interface FormFieldEditorProps {
  field: ActionFormFieldProps;
  fieldSettings: FieldSettings;
  isEditable: boolean;
  onChange: (settings: FieldSettings) => void;
}

function FormFieldEditor({
  field,
  fieldSettings,
  isEditable,
  onChange,
}: FormFieldEditorProps) {
  return (
    <FormFieldContainer>
      {isEditable && (
        <SettingsContainer>
          <Icon name="grabber2" size={14} />
        </SettingsContainer>
      )}
      <InputContainer>
        <FormFieldWidget key={field.name} formField={field} />
      </InputContainer>
      {isEditable && (
        <FieldSettingsButtons
          fieldSettings={fieldSettings}
          onChange={onChange}
        />
      )}
    </FormFieldContainer>
  );
}

export default FormFieldEditor;
