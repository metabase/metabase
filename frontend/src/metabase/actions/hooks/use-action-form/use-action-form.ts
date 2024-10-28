import { useCallback, useMemo } from "react";
import _ from "underscore";

import { getForm, getFormValidationSchema } from "metabase/actions/utils";
import type {
  ActionFormInitialValues,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import {
  formatInitialValue,
  formatSubmitValues,
  getChangedValues,
  getOrGenerateFieldSettings,
} from "./utils";

type Opts = {
  action: WritebackAction;
  initialValues?: ActionFormInitialValues;
  prefetchesInitialValues?: boolean;
};

const INITIAL_VALUES = {};

function useActionForm({
  action,
  initialValues = INITIAL_VALUES,
  prefetchesInitialValues,
}: Opts) {
  const fieldSettings = useMemo(() => {
    return getOrGenerateFieldSettings(
      action.parameters,
      action.visualization_settings?.fields,
    );
  }, [action]);

  const form = useMemo(
    () => getForm(action.parameters, fieldSettings),
    [action.parameters, fieldSettings],
  );

  const validationSchema = useMemo(
    () => getFormValidationSchema(action.parameters, fieldSettings),
    [action.parameters, fieldSettings],
  );

  const cleanedInitialValues = useMemo(() => {
    const values = validationSchema.cast(initialValues);

    return _.mapObject(values, (value, fieldId) => {
      const formField = fieldSettings[fieldId];

      return formatInitialValue(value, formField?.inputType);
    });
  }, [initialValues, fieldSettings, validationSchema]);

  const getCleanValues = useCallback(
    (values: ParametersForActionExecution = {}) => {
      const allValues = { ...cleanedInitialValues, ...values };
      const formatted = formatSubmitValues(allValues, fieldSettings);

      // For some actions (e.g. implicit update actions), we prefetch
      // selected row values, and pass them as initial values to prefill
      // the form. In that case, we want to return only changed values.
      return prefetchesInitialValues
        ? getChangedValues(formatted, initialValues)
        : formatted;
    },
    [
      initialValues,
      cleanedInitialValues,
      fieldSettings,
      prefetchesInitialValues,
    ],
  );

  return {
    form,
    validationSchema,
    initialValues: cleanedInitialValues,
    getCleanValues,
  };
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useActionForm;
