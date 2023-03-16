import React, { useMemo } from "react";
import { t } from "ttag";

import type { FormikHelpers } from "formik";

import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";

import { getForm, getFormValidationSchema } from "metabase/actions/utils";

import type {
  ActionFormInitialValues,
  ActionFormSettings,
  WritebackParameter,
  Parameter,
  ParametersForActionExecution,
} from "metabase-types/api";

import ActionFormFieldWidget from "../ActionFormFieldWidget";
import { ActionFormButtonContainer } from "./ActionForm.styled";

interface ActionFormProps {
  parameters: WritebackParameter[] | Parameter[];
  initialValues?: ActionFormInitialValues;
  formSettings?: ActionFormSettings;
  submitTitle?: string;
  submitButtonColor?: string;
  onSubmit: (
    params: ParametersForActionExecution,
    actions: FormikHelpers<ParametersForActionExecution>,
  ) => void;
  onClose?: () => void;
}

export const ActionForm = ({
  parameters,
  initialValues = {},
  formSettings,
  submitTitle,
  submitButtonColor = "primary",
  onSubmit,
  onClose,
}: ActionFormProps): JSX.Element => {
  // allow us to change the color of the submit button
  const submitButtonVariant = { [submitButtonColor]: true };

  const form = useMemo(
    () => getForm(parameters, formSettings?.fields),
    [parameters, formSettings?.fields],
  );

  const formValidationSchema = useMemo(
    () => getFormValidationSchema(parameters, formSettings?.fields),
    [parameters, formSettings?.fields],
  );

  const formInitialValues = useMemo(
    () => formValidationSchema.cast(initialValues),
    [initialValues, formValidationSchema],
  );

  return (
    <FormProvider
      initialValues={formInitialValues}
      validationSchema={formValidationSchema}
      onSubmit={onSubmit}
      enableReinitialize
    >
      <Form role="form" data-testid="action-form">
        {form.fields.map(field => (
          <ActionFormFieldWidget key={field.name} formField={field} />
        ))}

        <ActionFormButtonContainer>
          {onClose && (
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
          )}
          <FormSubmitButton
            title={submitTitle ?? t`Submit`}
            {...submitButtonVariant}
          />
        </ActionFormButtonContainer>

        <FormErrorMessage />
      </Form>
    </FormProvider>
  );
};
