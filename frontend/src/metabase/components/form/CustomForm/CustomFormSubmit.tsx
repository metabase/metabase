import React from "react";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";

import { FormLegacyContext, LegacyContextTypes } from "./types";
import { FormField, NestedFormField } from "metabase-types/forms";

export interface CustomFormSubmitProps {
  children: React.ReactNode;

  // ActionButton props
  fullWidth?: boolean;
}

function CustomFormSubmit({
  submitting,
  invalid,
  pristine,
  handleSubmit,
  submitTitle,
  renderSubmit,
  disablePristineSubmit,
  children,
  shouldPersistError,
  fields,
  error,
  ...props
}: CustomFormSubmitProps & FormLegacyContext) {
  const title = children || submitTitle || t`Submit`;
  const canSubmit = !(
    submitting ||
    isFormInvalid({
      shouldPersistError,
      invalid,
      fields,
      error,
    }) ||
    (pristine && disablePristineSubmit)
  );

  if (renderSubmit) {
    return renderSubmit({ title, canSubmit, handleSubmit });
  }

  return (
    <ActionButton
      normalText={title}
      activeText={title}
      failedText={t`Failed`}
      successText={t`Success`}
      primary={canSubmit}
      disabled={!canSubmit}
      {...props}
      type="submit"
      actionFn={handleSubmit}
    />
  );
}

const CustomFormSubmitLegacyContext = (
  props: CustomFormSubmitProps,
  context: FormLegacyContext,
) => <CustomFormSubmit {...props} {...context} />;

CustomFormSubmitLegacyContext.contextTypes = _.pick(
  LegacyContextTypes,
  "values",
  "submitting",
  "invalid",
  "pristine",
  "handleSubmit",
  "submitTitle",
  "renderSubmit",
  "disablePristineSubmit",
  "shouldPersistError",
  "fields",
  "error",
);

interface IsFormInvalidProps {
  fields: NestedFormField;
  invalid: boolean;
  shouldPersistError?: boolean;
  error?: string;
}

function isFormInvalid({
  shouldPersistError,
  fields,
  invalid,
  error,
}: IsFormInvalidProps): boolean {
  if (shouldPersistError && error) {
    return areAllFieldsUntouched(fields);
  }

  return invalid;
}

function areAllFieldsUntouched(fields: NestedFormField): boolean {
  const allFields = traverseAllFields(fields);
  return allFields.every(field => !field.touched);
}

function traverseAllFields(fields: NestedFormField): FormField[] {
  return Object.keys(fields).flatMap((fieldOrNestedField: string) => {
    const field = fields[fieldOrNestedField];
    if (isReduxFormField(field)) {
      return [field as FormField];
    }

    return traverseAllFields(field as NestedFormField);
  });
}

function isReduxFormField(field: FormField | NestedFormField) {
  return Boolean(field.onChange);
}

export default CustomFormSubmitLegacyContext;
