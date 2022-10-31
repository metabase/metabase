import { useCallback } from "react";
import type { FormikHelpers } from "formik";
import { FormError } from "./types";

export interface UseFormProps<T> {
  onSubmit: (data: T) => void;
}

export interface UseFormResult<T> {
  handleSubmit: (data: T, helpers: FormikHelpers<T>) => void;
}

const useForm = <T>({ onSubmit }: UseFormProps<T>): UseFormResult<T> => {
  const handleSubmit = useCallback(
    async (data: T, helpers: FormikHelpers<T>) => {
      try {
        helpers.setStatus({ status: "pending" });
        await onSubmit(data);
        helpers.setStatus({ status: "fulfilled" });
      } catch (error) {
        helpers.setErrors(getFormErrors(error));
        helpers.setStatus({
          status: "rejected",
          message: getFormMessage(error),
        });
      }
    },
    [onSubmit],
  );

  return { handleSubmit };
};

const isFormError = <T>(error: unknown): error is FormError<T> => {
  return error != null && typeof error === "object";
};

const getFormErrors = (error: unknown) => {
  return isFormError(error) ? error.data?.errors ?? error.errors ?? {} : {};
};

const getFormMessage = (error: unknown) => {
  return isFormError(error) ? error.data?.message ?? error.message : undefined;
};

export default useForm;
