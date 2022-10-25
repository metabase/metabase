import { useCallback } from "react";
import type { FormikHelpers } from "formik";
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
          const { data } = error;
          helpers.setErrors(data?.errors ?? {});
          helpers.setStatus({ status: "rejected", message: data?.message });
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

export default useForm;
