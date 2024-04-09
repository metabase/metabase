import type { FormikHelpers } from "formik";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import useActionForm from "metabase/actions/hooks/use-action-form";
import {
  getSubmitButtonColor,
  getSubmitButtonLabel,
} from "metabase/actions/utils";
import Button from "metabase/core/components/Button";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { Form, FormProvider } from "metabase/forms";
import type {
  ActionFormInitialValues,
  ParameterId,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import { ActionFormFieldWidget } from "../ActionFormFieldWidget";

import { ActionFormButtonContainer } from "./ActionForm.styled";

interface ActionFormProps {
  action: WritebackAction;
  initialValues?: ActionFormInitialValues;
  prefetchesInitialValues?: boolean;

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
  initialValues: rawInitialValues = {},
  prefetchesInitialValues,
  hiddenFields = [],
  onSubmit,
  onClose,
}: ActionFormProps): JSX.Element {
  const { initialValues, form, validationSchema, getCleanValues } =
    useActionForm({
      action,
      initialValues: rawInitialValues,
      prefetchesInitialValues,
    });

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
    ) => onSubmit(getCleanValues(values), actions),
    [getCleanValues, onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionForm;
