import React, { useCallback, useMemo } from "react";

import Form from "metabase/containers/FormikForm";
import {
  getFormFieldForParameter,
  getSubmitButtonLabel,
  generateFieldSettingsFromParameters,
} from "metabase/writeback/components/ActionCreator/FormCreator";

import type {
  WritebackParameter,
  WritebackQueryAction,
  OnSubmitActionForm,
} from "metabase-types/api";

import { setDefaultValues, setNumericValues } from "./utils";

interface Props {
  missingParameters: WritebackParameter[];
  action: WritebackQueryAction;
  onSubmit: OnSubmitActionForm;
  onSubmitSuccess?: () => void;
}

function ActionParametersInputForm({
  missingParameters,
  action,
  onSubmit,
  onSubmitSuccess,
}: Props) {
  const fieldSettings = useMemo(
    () =>
      action.visualization_settings?.fields ??
      generateFieldSettingsFromParameters(missingParameters),
    [action, missingParameters],
  );
  const formParams = useMemo(
    () => missingParameters ?? Object.values(action.parameters) ?? [],
    [missingParameters, action],
  );

  const form = useMemo(() => {
    return {
      fields: formParams?.map(param =>
        getFormFieldForParameter(param, fieldSettings[param.id] ?? {}),
      ),
    };
  }, [formParams, fieldSettings]);

  const handleSubmit = useCallback(
    async (params, actions) => {
      actions.setSubmitting(true);
      const paramsWithDefaultValues = setDefaultValues(params, fieldSettings);
      const paramsWithNumericValues = setNumericValues(
        paramsWithDefaultValues,
        fieldSettings,
      );

      const { success, error } = await onSubmit(paramsWithNumericValues);

      if (success) {
        actions.setErrors({});
        onSubmitSuccess?.();
        actions.resetForm();
      } else {
        throw new Error(error);
      }
    },
    [onSubmit, onSubmitSuccess, fieldSettings],
  );

  const initialValues = useMemo(
    () => Object.fromEntries(form.fields.map(field => [field.name, ""])),
    [form],
  );

  const submitButtonLabel = getSubmitButtonLabel(action);

  return (
    <Form
      form={form}
      initialValues={initialValues}
      onSubmit={handleSubmit}
      submitTitle={submitButtonLabel}
    />
  );
}

export default ActionParametersInputForm;
