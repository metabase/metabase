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

import {
  formatInitialValue,
  formatSubmitValues,
  getChangedValues,
} from "./utils";

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
    (values: ParametersForActionExecution = {}) => {
      const allValues = { ...cleanInitialValues, ...values };
      const formatted = formatSubmitValues(allValues, fieldSettings);

      const isImplicitUpdate =
        action.type === "implicit" && action.kind === "row/update";

      // For implicit update actions, we sometimes prefetch selected row values,
      // and pass them as initial values to prefill the form.
      // In that case, we want to return only changed values
      return isImplicitUpdate
        ? getChangedValues(formatted, initialValues)
        : formatted;
    },
    [action, initialValues, cleanInitialValues, fieldSettings],
  );

  return {
    form,
    validationSchema,
    initialValues: cleanInitialValues,
    getCleanValues,
  };
}

export default useActionForm;
