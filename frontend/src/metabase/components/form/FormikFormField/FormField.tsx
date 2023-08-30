import type * as React from "react";

import type {
  FieldName,
  FieldValues,
  FormField as FormFieldType,
  BaseFieldDefinition,
  FormFieldDefinition,
} from "metabase-types/forms";

import FormFieldView from "./FormFieldView";

type ReduxFormProps<Values> = Pick<FormFieldType<Values>, "name"> &
  Partial<Pick<FormFieldType<Values>, "error" | "visited" | "active">>;

interface FormFieldProps<Values>
  extends BaseFieldDefinition,
    Omit<ReduxFormProps<Values>, "name"> {
  field: FormFieldType<Values>;
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

function getDescriptionPositionPropValue(
  descriptionPosition?: "top" | "bottom",
  formField?: FormFieldDefinition,
) {
  return descriptionPosition ?? formField?.descriptionPosition ?? "top";
}

function getHiddenPropValue(hidden?: boolean, formField?: FormFieldDefinition) {
  if (typeof hidden === "boolean") {
    return hidden;
  }
  if (formField) {
    return formField.hidden || formField.type === "hidden";
  }
  return false;
}

function getHorizontalPropValue(
  horizontal?: boolean,
  formField?: FormFieldDefinition,
) {
  if (typeof horizontal === "boolean") {
    return horizontal;
  }
  if (formField) {
    return formField.horizontal || formField.type === "boolean";
  }
  return false;
}

/**
 * @deprecated
 */
function FormField<Values>({
  className,
  formField,
  children,
  ...props
}: FormFieldProps<Values>) {
  const title = props.title ?? formField?.title;
  const type = props.type ?? formField.type;
  const description = props.description ?? formField?.description;
  const descriptionPosition = getDescriptionPositionPropValue(
    props.descriptionPosition,
    formField,
  );

  const info = props.info ?? formField?.info;
  const infoLabel = props.infoLabel ?? formField?.infoLabel;
  const infoLabelTooltip =
    props.infoLabelTooltip ?? formField?.infoLabelTooltip;

  const align = props.align ?? formField?.align ?? "right";
  const hidden = getHiddenPropValue(props.hidden, formField);
  const horizontal = getHorizontalPropValue(props.horizontal, formField);

  const isToggle = type === "boolean";
  const standAloneLabel = isToggle && align === "right" && !description;

  if (hidden) {
    return null;
  }

  const {
    name,
    error: errorProp,
    visited,
    active,
  } = {
    ...(props.field || {}),
    ...props,
  };

  const shouldShowError = visited && !active;
  const error = !shouldShowError ? undefined : errorProp;

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormField;
