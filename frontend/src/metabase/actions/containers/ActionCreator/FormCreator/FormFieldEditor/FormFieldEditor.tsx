import { t } from "ttag";

import { ActionFormFieldWidget } from "metabase/actions/components/ActionFormFieldWidget";
import type { ActionFormFieldProps } from "metabase/actions/types";
import { Checkbox } from "metabase/ui";
import type { FieldSettings } from "metabase-types/api";

import {
  Column,
  EditorContainer,
  FormFieldContainer,
  Header,
  InputContainer,
  PreviewContainer,
  Subtitle,
  Title,
} from "./FormFieldEditor.styled";

export interface FormFieldEditorProps {
  field: ActionFormFieldProps;
  fieldSettings: FieldSettings;
  onChange: (settings: FieldSettings) => void;
}

function FormFieldEditor({
  field,
  fieldSettings,
  onChange,
}: FormFieldEditorProps) {
  const hidden = fieldSettings?.hidden ?? false;

  return (
    <FormFieldContainer data-testid="form-field-container">
      <EditorContainer>
        <Column />
        <Column full>
          <Header>
            <Title>{field.title}</Title>
          </Header>
          <Subtitle>{t`Appearance`}</Subtitle>
        </Column>
      </EditorContainer>
      <PreviewContainer data-testid="preview-container">
        <Column />
        <Column full>
          <InputContainer>
            <ActionFormFieldWidget
              hidden={hidden}
              actions={
                <Checkbox
                  styles={{
                    label: {
                      fontSize: "12px",
                      color: "var(--mb-color-text-secondary)",
                    },
                  }}
                  onChange={() => {
                    onChange({
                      ...fieldSettings,
                      hidden: !hidden,
                    });
                  }}
                  checked={!hidden}
                  label={t`Show field`}
                />
              }
              formField={field}
            />
          </InputContainer>
        </Column>
      </PreviewContainer>
    </FormFieldContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormFieldEditor;
