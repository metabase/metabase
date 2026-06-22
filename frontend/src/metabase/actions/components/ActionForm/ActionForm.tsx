import type { FormikHelpers } from "formik";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import useActionForm from "metabase/actions/hooks/use-action-form";
import {
  getSubmitButtonColor,
  getSubmitButtonLabel,
} from "metabase/actions/utils";
import { FormErrorMessage } from "metabase/common/components/FormErrorMessage";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import { Button, Flex } from "metabase/ui";
import type {
  ActionFormInitialValues,
  ParameterId,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import { ActionFormFieldWidget } from "../ActionFormFieldWidget";

interface ActionFormProps {
  action: WritebackAction;
  initialValues?: ActionFormInitialValues;

  // Parameters that shouldn't be displayed in the form
  // Can be used to "lock" certain parameter values.
  // E.g. when a value is coming from a dashboard filter.
  // Hidden field values should still be included in initialValues,
  // and they will be submitted together in batch.
  hiddenFields?: ParameterId[];

  submitButtonFullWidth?: boolean;

  onSubmit: (
    parameters: ParametersForActionExecution,
    actions: FormikHelpers<ParametersForActionExecution>,
  ) => void;
  onClose?: () => void;
}

function ActionForm({
  action,
  initialValues: rawInitialValues = {},
  hiddenFields = [],
  submitButtonFullWidth,
  onSubmit,
  onClose,
}: ActionFormProps): JSX.Element {
  const { initialValues, form, validationSchema, getCleanValues } =
    useActionForm({
      action,
      initialValues: rawInitialValues,
    });

  const editableFields = useMemo(
    () => form.fields.filter((field) => !hiddenFields.includes(field.name)),
    [form, hiddenFields],
  );

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
        {editableFields.map((field) => (
          <ActionFormFieldWidget key={field.name} formField={field} />
        ))}

        <Flex justify="flex-end" gap="sm">
          {onClose && (
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
          )}
          <FormSubmitButton
            label={getSubmitButtonLabel(action)}
            variant="filled"
            color={getSubmitButtonColor(action)}
            fullWidth={submitButtonFullWidth}
          />
        </Flex>

        <FormErrorMessage />
      </Form>
    </FormProvider>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionForm;
