import { useCallback, useMemo } from "react";
import _ from "underscore";

import { getForm, getFormValidationSchema } from "metabase/actions/utils";
import type {
  ActionFormInitialValues,
  ParametersForActionExecution,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import {
  formatInitialValue,
  formatSubmitValues,
  getOrGenerateFieldSettings,
} from "./utils";

type Opts = {
  action: WritebackAction;
  initialValues?: ActionFormInitialValues;
};

const INITIAL_VALUES = {};
const DEFAULT_PARAMETERS: WritebackParameter[] = [];

function useActionForm({
  action: { parameters = DEFAULT_PARAMETERS, visualization_settings },
  initialValues = INITIAL_VALUES,
}: Opts) {
  const fieldSettings = useMemo(() => {
    return getOrGenerateFieldSettings(
      parameters,
      visualization_settings?.fields,
    );
  }, [parameters, visualization_settings]);

  const form = useMemo(
    () => getForm(parameters, fieldSettings),
    [parameters, fieldSettings],
  );

  const validationSchema = useMemo(
    () => getFormValidationSchema(parameters, fieldSettings),
    [parameters, fieldSettings],
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

      return formatted;
    },
    [cleanedInitialValues, fieldSettings],
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
