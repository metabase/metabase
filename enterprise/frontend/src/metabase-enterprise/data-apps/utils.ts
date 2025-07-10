import { t } from "ttag";

import type { DataApp } from "metabase/data-apps/types";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { slugify } from "metabase/lib/formatting/url";

export function createMockDataApp(opts: Partial<DataApp> = {}): DataApp {
  return {
    id: "",
    name: "Untitled",
    description: null,
    definition: null,
    slug: slugify(opts.name || "Untitled"),
    status: "private", // private, published, archived
    ...opts,
  };
}

export const getUpdateApiErrorMessage = (
  error: GenericErrorResponse | unknown,
): string => {
  const maybeError = error as GenericErrorResponse;

  if (typeof maybeError.data === "string") {
    return maybeError.data;
  }

  if (
    Array.isArray(maybeError.data?.errors) &&
    "error" in maybeError.data?.errors[0]
  ) {
    return maybeError.data.errors[0].error;
  }

  if (Array.isArray(maybeError.errors) && "error" in maybeError.errors[0]) {
    return maybeError.errors[0].error;
  }

  return t`Unknown error`;
};
