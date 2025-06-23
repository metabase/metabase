import { useFormik } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import type { DescribeActionFormResponse } from "metabase-enterprise/data_editing/tables/types";

export type TableActionFormProps<TData> = {
  description?: DescribeActionFormResponse | null;
  onSubmit: (values: TData) => void | Promise<void>;
};

export function useTableActionForm<TData extends Record<string, unknown>>({
  description,
  onSubmit,
}: TableActionFormProps<TData>) {
  const validateForm = useCallback(
    (values: TData) => {
      const errors: Record<string, string> = {};

      description?.parameters.forEach((parameter) => {
        const isRequired = !parameter.optional;
        if (isRequired && !values[parameter.id]) {
          errors[parameter.id] = t`This value is required`;
        }
      });

      return errors;
    },
    [description?.parameters],
  );

  const handleReset = useCallback(
    (values: Record<string, unknown>) => {
      if (!description) {
        return;
      }

      for (const parameter of description.parameters) {
        if (parameter.value) {
          values[parameter.id] = parameter.value?.toString();
        }
      }
    },
    [description],
  );

  return useFormik({
    initialValues: {} as TData,
    onSubmit,
    validate: validateForm,
    validateOnMount: true,
    onReset: handleReset,
  });
}
