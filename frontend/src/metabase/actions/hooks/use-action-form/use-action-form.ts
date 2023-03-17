import { useCallback, useMemo } from "react";
import _ from "underscore";

import {
  getForm,
  getFormValidationSchema,
  generateFieldSettingsFromParameters,
} from "metabase/actions/utils";

import type {
  ActionFormInitialValues,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import { formatInitialValue, cleanSubmitValues } from "./utils";

type Opts = {
  action: WritebackAction;
  initialValues?: ActionFormInitialValues;
};

function useActionForm({ action, initialValues = {} }: Opts) {
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

  const validationSchema = useMemo(
    () => getFormValidationSchema(action.parameters, fieldSettings),
    [action.parameters, fieldSettings],
  );

  const cleanInitialValues = useMemo(() => {
    const values = validationSchema.cast(initialValues);
    return _.mapObject(values, (value, fieldId) => {
      const formField = fieldSettings[fieldId];
      return formatInitialValue(value, formField?.inputType);
    });
  }, [initialValues, fieldSettings, validationSchema]);

  const getCleanValues = useCallback(
    (values: ParametersForActionExecution = {}) =>
      cleanSubmitValues({
        values: { ...cleanInitialValues, ...values },
        initialValues,
        fieldSettings,
      }),
    [initialValues, cleanInitialValues, fieldSettings],
  );

  return {
    form,
    validationSchema,
    initialValues: cleanInitialValues,
    getCleanValues,
  };
}

export default useActionForm;
