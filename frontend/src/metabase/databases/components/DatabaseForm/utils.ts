import _ from "underscore";

import { getDefaultEngineKey } from "metabase/databases/utils/engine";
import { useFormErrorMessage } from "metabase/forms";
import type { DatabaseData, Engine } from "metabase-types/api";

export const useHasConnectionError = () => {
  const errorMessage = useFormErrorMessage();
  return !!errorMessage;
};

export const getEngine = (
  engines: Record<string, Engine>,
  engineKey?: string,
) => {
  return engineKey ? engines[engineKey] : undefined;
};

export const getEngineKey = (
  engines: Record<string, Engine>,
  values?: Partial<DatabaseData>,
  isAdvanced?: boolean,
) => {
  if (values?.engine && Object.keys(engines).includes(values.engine)) {
    return values.engine;
  } else if (isAdvanced) {
    return getDefaultEngineKey(engines);
  }
};

export const checkFormIsDirty = (
  initialValues: DatabaseData,
  currentValues: DatabaseData,
) => {
  const sanitizeValues = (values: DatabaseData) => {
    return {
      ...values,
      // Ignore "advanced-options" when checking if the form is dirty (#65988). It is not an actual field.
      details: _.omit(values.details, ["advanced-options"]),
      // These boolean fields are nullable. When null, they are treated false in the form.
      refingerprint: values.refingerprint || false,
      auto_run_queries: values.auto_run_queries || false,
    };
  };

  return !_.isEqual(
    sanitizeValues(initialValues),
    sanitizeValues(currentValues),
  );
};
