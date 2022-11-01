import React from "react";
import { Formik } from "formik";
import type { FormikConfig } from "formik";
import useFormSubmit from "metabase/core/hooks/use-form-submit";

function FormProvider<T>({ onSubmit, ...props }: FormikConfig<T>): JSX.Element {
  const handleSubmit = useFormSubmit(onSubmit);
  return <Formik {...props} onSubmit={handleSubmit} />;
}

export default FormProvider;
