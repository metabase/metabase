import _ from "underscore";

import type { DatabaseData } from "metabase-types/api";

export const checkFormIsDirty = (
  initialValues: DatabaseData,
  currentValues: DatabaseData,
) => {
  const sanitizeValues = (values: DatabaseData) => {
    return {
      ...values,
      // Ignore "advanced-options" when checking if the form is dirty. It is not an actual field.
      details: _.omit(values.details, ["advanced-options"]),
      // These boolean fields are nullable. When null, they are treated as false in the form.
      refingerprint: values.refingerprint || false,
      auto_run_queries: values.auto_run_queries || false,
    };
  };

  return !_.isEqual(
    sanitizeValues(initialValues),
    sanitizeValues(currentValues),
  );
};
