import React, { useMemo } from "react";
import { t } from "ttag";

import type { FormikHelpers } from "formik";

import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";

import {
  getForm,
  getFormValidationSchema,
  getSubmitButtonColor,
  getSubmitButtonLabel,
  generateFieldSettingsFromParameters,
} from "metabase/actions/utils";

import type {
  ActionFormInitialValues,
  WritebackParameter,
  Parameter,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import ActionFormFieldWidget from "../ActionFormFieldWidget";
import { ActionFormButtonContainer } from "./ActionForm.styled";

interface ActionFormProps {
  action: WritebackAction;
  initialValues?: ActionFormInitialValues;
  parameters?: WritebackParameter[] | Parameter[];
  onSubmit: (
    params: ParametersForActionExecution,
    actions: FormikHelpers<ParametersForActionExecution>,
  ) => void;
  onClose?: () => void;
}

function ActionForm({
  action,
  initialValues = {},
  parameters = action.parameters,
  onSubmit,
  onClose,
}: ActionFormProps): JSX.Element {
  const fieldSettings = useMemo(
    () =>
      action.visualization_settings?.fields ||
      generateFieldSettingsFromParameters(action.parameters),
    [action],
  );

  const form = useMemo(
    () => getForm(parameters, fieldSettings),
    [parameters, fieldSettings],
  );

  const formValidationSchema = useMemo(
    () => getFormValidationSchema(parameters, fieldSettings),
    [parameters, fieldSettings],
  );

  const formInitialValues = useMemo(
    () => formValidationSchema.cast(initialValues),
    [initialValues, formValidationSchema],
  );

  const submitButtonProps = useMemo(() => {
    const variant = getSubmitButtonColor(action);
    return {
      title: getSubmitButtonLabel(action),
      [variant]: true,
    };
  }, [action]);

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
          <FormSubmitButton {...submitButtonProps} />
        </ActionFormButtonContainer>

        <FormErrorMessage />
      </Form>
    </FormProvider>
  );
}

export default ActionForm;
