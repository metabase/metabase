import type { FormikConfig, FormikValues } from "formik";
import { Formik } from "formik";
import type { AnySchema } from "yup";

import type { FormStatus } from "../../contexts";
import { FormContext } from "../../contexts";
import { useFormSubmit, useFormValidation } from "../../hooks";

export interface FormProviderProps<T, C> extends FormikConfig<T> {
  validationSchema?: AnySchema;
  validationContext?: C;
}

export function FormProvider<T extends FormikValues, C = unknown>({
  initialValues,
  validationSchema,
  validationContext,
  onSubmit,
  ...props
}: FormProviderProps<T, C>): JSX.Element {
  const { state, handleSubmit, setState } = useFormSubmit({ onSubmit });
  const { initialErrors, handleValidate } = useFormValidation<T, C>({
    initialValues,
    validationSchema,
    validationContext,
  });
  const setStatus = (status: FormStatus) =>
    setState(state => ({ ...state, status }));

  return (
    <FormContext.Provider value={{ ...state, setStatus }}>
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
