import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

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
  ParameterId,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import ActionFormFieldWidget from "../ActionFormFieldWidget";

import { formatInitialValue, cleanSubmitValues } from "./utils";
import { ActionFormButtonContainer } from "./ActionForm.styled";

interface ActionFormProps {
  action: WritebackAction;
  initialValues?: ActionFormInitialValues;

  // Parameters that shouldn't be displayed in the form
  // Can be used to "lock" certain parameter values.
  // E.g. when a value is coming from a dashboard filter.
  // Hidden field values should still be included in initialValues,
  // and they will be submitted together in batch.
  hiddenFields?: ParameterId[];

  onSubmit: (
    parameters: ParametersForActionExecution,
    actions: FormikHelpers<ParametersForActionExecution>,
  ) => void;
  onClose?: () => void;
}

function ActionForm({
  action,
  initialValues = {},
  hiddenFields = [],
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
    () => getForm(action.parameters, fieldSettings),
    [action.parameters, fieldSettings],
  );

  const formValidationSchema = useMemo(
    () => getFormValidationSchema(action.parameters, fieldSettings),
    [action.parameters, fieldSettings],
  );

  const formInitialValues = useMemo(() => {
    const values = formValidationSchema.cast(initialValues);
    return _.mapObject(values, (value, fieldId) => {
      const formField = fieldSettings[fieldId];
      return formatInitialValue(value, formField?.inputType);
    });
  }, [initialValues, fieldSettings, formValidationSchema]);

  const editableFields = useMemo(
    () => form.fields.filter(field => !hiddenFields.includes(field.name)),
    [form, hiddenFields],
  );

  const submitButtonProps = useMemo(() => {
    const variant = getSubmitButtonColor(action);
    return {
      title: getSubmitButtonLabel(action),
      [variant]: true,
    };
  }, [action]);

  const handleSubmit = useCallback(
    (
      values: ParametersForActionExecution,
      actions: FormikHelpers<ParametersForActionExecution>,
    ) => {
      onSubmit(
        cleanSubmitValues({ values, initialValues, fieldSettings }),
        actions,
      );
    },
    [initialValues, fieldSettings, onSubmit],
  );

  return (
    <FormProvider
      initialValues={formInitialValues}
      validationSchema={formValidationSchema}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      <Form role="form" data-testid="action-form">
        {editableFields.map(field => (
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
