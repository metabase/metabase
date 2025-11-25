import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { FormikErrors } from "formik";
import { P, isMatching } from "ts-pattern";

import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";

export function useMetabotIdPath() {
  const location = useSelector(getLocation);
  const metabotId = Number(location?.pathname?.split("/").pop());
  return Number.isNaN(metabotId) ? null : metabotId;
}

// https://redux-toolkit.js.org/rtk-query/usage/error-handling
// https://redux-toolkit.js.org/rtk-query/usage-with-typescript#type-safe-error-handling
export const isFetchBaseQueryError = (
  error: unknown,
): error is FetchBaseQueryError =>
  isMatching({ status: P.any, data: P.any }, error);

type IFieldError<Values> =
  | string
  | {
      message: string;
    }
  | {
      errors: FormikErrors<Values>;
    };

const isFieldError = <Values>(error: unknown): error is IFieldError<Values> =>
  isMatching(
    P.union(
      P.string,
      { message: P.string },
      { errors: P.record(P.string, P.any) },
    ),
    error,
  );

// If `error` is a form field error, throw a structured exception with the shape
// `{data: {errors: FormikErrors}}` that will be caught as a validation error by
// [[FormProvider]] in `frontend/src/metabase/forms/components/FormProvider/`.
export const handleFieldError = <Values>(
  error: unknown,
  defaultField: keyof Values,
) => {
  if (!isFieldError<Values>(error)) {
    return;
  }

  if (typeof error === "string") {
    throw { data: { errors: { [defaultField]: error } } };
  }

  if ("message" in error) {
    throw { data: { errors: { [defaultField]: error.message } } };
  }

  if ("errors" in error) {
    throw { data: error };
  }
};
