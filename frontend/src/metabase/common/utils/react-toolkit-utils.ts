import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { P, isMatching } from "ts-pattern";

// https://redux-toolkit.js.org/rtk-query/usage/error-handling
// https://redux-toolkit.js.org/rtk-query/usage-with-typescript#type-safe-error-handling
export const isFetchBaseQueryError = (
  error: unknown,
): error is FetchBaseQueryError =>
  isMatching({ status: P.any, data: P.any }, error);
