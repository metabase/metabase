import React from "react";
import { Formik } from "formik";
import type { FormikConfig } from "formik";
import useFormSubmit from "metabase/core/hooks/use-form-submit";
import useFormValidation from "metabase/core/hooks/use-form-validation";

export interface FormProviderProps<T, C> extends FormikConfig<T> {
  validationContext?: C;
}

function FormProvider<T, C>({
  initialValues,
  validate,
  validationSchema,
  validationContext,
  onSubmit,
  ...props
}: FormProviderProps<T, C>): JSX.Element {
  const { handleSubmit } = useFormSubmit({ onSubmit });
  const { initialErrors, handleValidate } = useFormValidation({
    initialValues,
    validationSchema,
    validationContext,
  });

  return (
    <Formik
      {...props}
      initialValues={initialValues}
      initialErrors={initialErrors}
      validate={validate ?? handleValidate}
      onSubmit={handleSubmit}
    />
  );
}

export default FormProvider;
