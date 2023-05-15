import { useCallback, useState } from "react";
import type { FormikHelpers } from "formik";
import { FormState } from "metabase/core/context/FormContext";
import { getResponseErrorMessage } from "metabase/core/utils/errors";
import { FormError } from "./types";

export interface UseFormSubmitProps<T> {
  onSubmit: (values: T, helpers: FormikHelpers<T>) => void;
}

export interface UseFormSubmitResult<T> {
  state: FormState;
  handleSubmit: (values: T, helpers: FormikHelpers<T>) => void;
}

const useFormSubmit = <T>({
  onSubmit,
}: UseFormSubmitProps<T>): UseFormSubmitResult<T> => {
  const [state, setState] = useState<FormState>({ status: "idle" });

  const handleSubmit = useCallback(
    async (data: T, helpers: FormikHelpers<T>) => {
      try {
        setState({ status: "pending" });
        await onSubmit(data, helpers);
        setState({ status: "fulfilled" });
      } catch (error) {
        helpers.setErrors(getFormErrors(error));
        setState({ status: "rejected", message: getFormMessage(error) });
      }
    },
    [onSubmit],
  );

  return {
    state,
    handleSubmit,
  };
};

const isFormError = <T>(error: unknown): error is FormError<T> => {
  return error != null && typeof error === "object";
};

const getFormErrors = (error: unknown) => {
  if (isFormError(error)) {
    if (typeof error.data !== "string") {
      return error.data?.errors ?? error.errors ?? {};
    }
  }

  return {};
};

const getFormMessage = (error: unknown) => {
  if (isFormError(error)) {
    return getResponseErrorMessage(error);
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useFormSubmit;
