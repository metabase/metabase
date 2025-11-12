import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
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

type IFieldError =
  | string
  | {
      message: string;
    }
  | {
      errors: { [key: string]: any };
    };

const isFieldError = (error: unknown): error is IFieldError =>
  isMatching(
    P.union(
      P.string,
      { message: P.string },
      { errors: P.record(P.string, P.any) },
    ),
    error,
  );

export const handleFieldError = (error: unknown) => {
  if (!isFieldError(error)) {
    return;
  }

  if (typeof error === "string") {
    throw { data: { errors: { terms_of_service: error } } };
  }

  if ("message" in error) {
    throw { data: { errors: { terms_of_service: error.message } } };
  }

  if ("errors" in error) {
    throw { data: error };
  }
};
