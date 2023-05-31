import React from "react";
import { Formik } from "formik";
import type { FormikConfig, FormikValues } from "formik";
import type { AnySchema } from "yup";
import useFormSubmit from "metabase/core/hooks/use-form-submit";
import useFormValidation from "metabase/core/hooks/use-form-validation";
import FormContext from "metabase/core/context/FormContext";

export interface FormProviderProps<T, C> extends FormikConfig<T> {
  validationSchema?: AnySchema;
  validationContext?: C;
}

function FormProvider<T extends FormikValues, C = unknown>({
  initialValues,
  validationSchema,
  validationContext,
  onSubmit,
  ...props
}: FormProviderProps<T, C>): JSX.Element {
  const { state, handleSubmit } = useFormSubmit({ onSubmit });
  const { initialErrors, handleValidate } = useFormValidation<T, C>({
    initialValues,
    validationSchema,
    validationContext,
  });

  return (
    <FormContext.Provider value={state}>
      <Formik<T>
        initialValues={initialValues}
        initialErrors={initialErrors}
        validate={handleValidate}
        onSubmit={handleSubmit}
        {...props}
      />
    </FormContext.Provider>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormProvider;
