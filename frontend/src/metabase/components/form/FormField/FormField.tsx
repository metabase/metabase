import React from "react";

import {
  FieldName,
  FieldValues,
  FormField as FormFieldType,
  BaseFieldDefinition,
  FormFieldDefinition,
} from "metabase-types/forms";

import FormFieldView from "./FormFieldView";

type ReduxFormProps = Pick<
  FormFieldType,
  "name" | "error" | "visited" | "active"
>;

interface FormFieldProps extends BaseFieldDefinition, ReduxFormProps {
  field: FormFieldType;
  formField: FormFieldDefinition;
  values: FieldValues;
  className?: string;
  children: React.ReactNode;
  onChangeField: (fieldName: FieldName, value: unknown) => void;
}

const ALL_DOT_CHARS = /\./g;

function getFieldId(formFieldName: FieldName) {
  return `formField-${formFieldName.replace(ALL_DOT_CHARS, "-")}`;
}

function FormField({
  className,
  formField,
  children,
  ...props
}: FormFieldProps) {
  const title = formField?.title;
  const description = formField?.description;
  const descriptionPosition =
    props.descriptionPosition ?? formField?.descriptionPosition ?? "top";
  const info = formField?.info;
  const infoLabel = formField?.infoLabel;
  const infoLabelTooltip = formField?.infoLabelTooltip;
  const align = formField?.align ?? "right";
  const hidden = formField && (formField.hidden || formField.type === "hidden");
  const horizontal =
    formField && (formField.horizontal || formField.type === "boolean");

  const isToggle = formField?.type === "boolean";
  const standAloneLabel = isToggle && align === "right" && !description;

  if (hidden) {
    return null;
  }

  const { name, error: errorProp, visited, active } = {
    ...(props.field || {}),
    ...props,
  };

  const shouldHideError = !visited || active;
  const error = shouldHideError ? undefined : errorProp;

  return (
    <FormFieldView
      fieldId={getFieldId(name)}
      className={className}
      name={name}
      error={error}
      title={title}
      description={description}
      descriptionPosition={descriptionPosition}
      info={info}
      infoLabel={infoLabel}
      infoLabelTooltip={infoLabelTooltip}
      align={align}
      standAloneLabel={standAloneLabel}
      horizontal={horizontal}
    >
      {children}
    </FormFieldView>
  );
}

export default FormField;
