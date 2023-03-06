import React, { useMemo } from "react";
import { t } from "ttag";

import Radio from "metabase/core/components/Radio";

import type { ActionFormFieldProps } from "metabase/actions/types";
import type { FieldSettings, FieldType } from "metabase-types/api";

import { FieldSettingsButtons } from "../../containers/ActionCreator/FormCreator/FieldSettingsButtons";
import {
  getFieldTypes,
  getInputTypes,
} from "../../containers/ActionCreator/FormCreator/constants";

import { FormFieldWidget } from "./ActionFormFieldWidget";
import {
  Column,
  DragHandle,
  EditorContainer,
  FormFieldContainer,
  Header,
  InputContainer,
  Title,
  Subtitle,
  PreviewContainer,
} from "./FormFieldEditor.styled";

export interface FormFieldEditorProps {
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
  const fieldTypes = useMemo(getFieldTypes, []);
  const inputTypes = useMemo(getInputTypes, []);

  const handleChangeFieldType = (nextFieldType: FieldType) => {
    const [defaultInputType] = inputTypes[nextFieldType];
    onChange({
      ...fieldSettings,
      fieldType: nextFieldType,
      inputType: defaultInputType.value,
    });
  };

  return (
    <FormFieldContainer>
      <EditorContainer>
        <Column>{isEditable && <DragHandle name="grabber2" />}</Column>
        <Column full>
          <Header>
            <Title>{field.title}</Title>
            {isEditable && (
              <FieldSettingsButtons
                fieldSettings={fieldSettings}
                onChange={onChange}
              />
            )}
          </Header>
          {isEditable && fieldSettings && (
            <>
              <Subtitle>{t`Field type`}</Subtitle>
              <Radio
                value={fieldSettings.fieldType}
                options={fieldTypes}
                aria-label={t`Field type`}
                variant="bubble"
                onChange={handleChangeFieldType}
              />
            </>
          )}
          <Subtitle>{t`Appearance`}</Subtitle>
        </Column>
      </EditorContainer>
      <PreviewContainer>
        <Column />
        <Column full>
          <InputContainer>
            <FormFieldWidget formField={field} />
          </InputContainer>
        </Column>
      </PreviewContainer>
    </FormFieldContainer>
  );
}

export default FormFieldEditor;
