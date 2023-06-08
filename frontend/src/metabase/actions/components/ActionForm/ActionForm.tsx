import { forwardRef, Ref, useCallback, useMemo } from "react";
import { t } from "ttag";

import type { FormikHelpers, FormikProps } from "formik";

import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";

import useActionForm from "metabase/actions/hooks/use-action-form";
import {
  getSubmitButtonColor,
  getSubmitButtonLabel,
} from "metabase/actions/utils";

import type {
  ActionFormInitialValues,
  ParameterId,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import ActionFormFieldWidget from "../ActionFormFieldWidget";

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

export type ActionFormRefData = FormikProps<ParametersForActionExecution>;

const ActionForm = forwardRef(function ActionForm(
  {
    action,
    initialValues: rawInitialValues = {},
    hiddenFields = [],
    onSubmit,
    onClose,
  }: ActionFormProps,
  ref: Ref<ActionFormRefData>,
): JSX.Element {
  const { initialValues, form, validationSchema, getCleanValues } =
    useActionForm({
      action,
      initialValues: rawInitialValues,
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
      innerRef={ref}
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
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionForm;
