import type { FormikHelpers } from "formik";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";

import { getResponseErrorMessage } from "metabase/lib/errors";

import type { FormState } from "../../contexts";

import type { FormError } from "./types";

export interface UseFormSubmitProps<T> {
  onSubmit: (values: T, helpers: FormikHelpers<T>) => void | Promise<any>;
}

export interface UseFormSubmitResult<T> {
  state: FormState;
  setState: Dispatch<SetStateAction<FormState>>;
  handleSubmit: (values: T, helpers: FormikHelpers<T>) => void;
}

export const useFormSubmit = <T>({
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
        console.error(error);
        helpers.setErrors(getFormErrors(error));
        setState({ status: "rejected", message: getFormMessage(error) });
      }
    },
    [onSubmit],
  );

  return {
    state,
    setState,
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
