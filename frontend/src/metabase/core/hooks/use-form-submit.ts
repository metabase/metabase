import { useCallback } from "react";
import type { FormikErrors, FormikHelpers } from "formik";

interface FormError<T> {
  data?: FormErrorData<T>;
}

interface FormErrorData<T> {
  errors?: FormikErrors<T>;
  message?: string;
}

const isFormError = <T>(error: unknown): error is FormError<T> => {
  return error != null && typeof error === "object";
};

const useFormSubmit = <T>(onSubmit: (data: T) => void) => {
  return useCallback(
    async (data: T, helpers: FormikHelpers<T>) => {
      try {
        helpers.setStatus(undefined);
        await onSubmit(data);
      } catch (error) {
        if (isFormError(error)) {
          helpers.setErrors(error?.data?.errors ?? {});
          helpers.setStatus(error?.data?.message);
        }
      }
    },
    [onSubmit],
  );
};

export default useFormSubmit;
