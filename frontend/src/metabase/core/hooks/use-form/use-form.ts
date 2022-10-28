import { useCallback } from "react";
import type { FormikHelpers } from "formik";
import { t } from "ttag";
import { FormError } from "./types";

const useForm = <T>(onSubmit: (data: T) => void) => {
  return useCallback(
    async (data: T, helpers: FormikHelpers<T>) => {
      try {
        helpers.setStatus({ status: "pending", message: undefined });
        await onSubmit(data);
        helpers.setStatus({ status: "fulfilled" });
      } catch (error) {
        if (isFormError(error)) {
          helpers.setErrors(getFieldErrors(error));
          helpers.setStatus({
            status: "rejected",
            message: getErrorMessage(error),
          });
        } else {
          helpers.setStatus({ status: "rejected", message: undefined });
        }
      }
    },
    [onSubmit],
  );
};

const isFormError = <T>(error: unknown): error is FormError<T> => {
  return error != null && typeof error === "object";
};

const getFieldErrors = <T>(error: FormError<T>) => {
  return error.data?.errors ?? error.errors ?? {};
};

const getErrorMessage = <T>(error: FormError<T>) => {
  return error.data?.message ?? error.message ?? t`An error occurred`;
};

export default useForm;
