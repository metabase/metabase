import type { FormikErrors } from "formik";

export interface FormError<T> extends FormErrorData<T> {
  data?: string | FormErrorData<T>;
}

export interface FormErrorData<T> {
  errors?: FormikErrors<T>;
  message?: string;
}
