import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { MutableRefObject } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { ActionFormFieldWidget } from "metabase/actions/components/ActionFormFieldWidget";
import { getFieldTypes } from "metabase/actions/constants";
import type { ActionFormFieldProps } from "metabase/actions/types";
import { getFieldSettingsForFieldType } from "metabase/actions/utils";
import { Checkbox, Group, Radio } from "metabase/ui";
import type { FieldSettings, FieldType } from "metabase-types/api";

import { FieldSettingsButtons } from "../FieldSettingsButtons";

import { DragHandle } from "./DragHandle";
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
  isEditable: boolean;
  onChange: (settings: FieldSettings) => void;
  dragHandleRef?: MutableRefObject<HTMLElement | null>;
  dragHandleListeners?: SyntheticListenerMap | undefined;
}

function FormFieldEditor({
  field,
  fieldSettings,
  isEditable,
  onChange,
  dragHandleRef,
  dragHandleListeners,
}: FormFieldEditorProps) {
  const fieldTypeOptions = useMemo(getFieldTypes, []);
  const hidden = fieldSettings?.hidden ?? false;

  const handleChangeFieldType = (nextFieldType: FieldType) => {
    onChange(getFieldSettingsForFieldType(fieldSettings, nextFieldType));
  };

  return (
    <FormFieldContainer data-testid="form-field-container">
      <EditorContainer>
        <Column>
          {isEditable && (
            <DragHandle
              ref={dragHandleRef}
              dragHandleListeners={dragHandleListeners}
            />
          )}
        </Column>
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
            <Radio.Group
              label={<Subtitle>{t`Field type`}</Subtitle>}
              value={fieldSettings.fieldType}
              // Unjustified type cast. FIXME
              onChange={(value) => handleChangeFieldType(value as FieldType)}
            >
              <Group gap="xl">
                {fieldTypeOptions.map((option) => (
                  <Radio
                    key={option.value}
                    value={option.value}
                    label={option.name}
                  />
                ))}
              </Group>
            </Radio.Group>
          )}
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
