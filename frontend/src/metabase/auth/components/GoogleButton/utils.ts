import { isObject } from "metabase-types/guards/common";

/** Field error messages from a failed Google sign-in request. */
export const getErrors = (error: unknown): string[] => {
  if (!isObject(error) || !isObject(error.data)) {
    return [];
  }
  const errors = error.data.errors;
  return isObject(errors) ? Object.values(errors).map(String) : [];
};
