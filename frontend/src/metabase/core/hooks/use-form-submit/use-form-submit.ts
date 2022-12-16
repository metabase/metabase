import { useCallback, useState } from "react";
import type { FormikHelpers } from "formik";
import { FormState } from "metabase/core/context/FormContext";
import {
  getResponseErrorMessage,
  GenericErrorResponse,
} from "metabase/core/utils/errors";
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
        const response = error as GenericErrorResponse;
        helpers.setErrors(getFormErrors(response));
        setState({ status: "rejected", message: getFormMessage(response) });
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

const getFormErrors = (error: GenericErrorResponse) => {
  if (isFormError(error)) {
    if (typeof error.data !== "string") {
      return error.data?.errors ?? error.errors ?? {};
    }
  }

  return {};
};

const getFormMessage = (error: GenericErrorResponse) => {
  if (isFormError(error)) {
    return getResponseErrorMessage(error);
  }
};

export default useFormSubmit;
