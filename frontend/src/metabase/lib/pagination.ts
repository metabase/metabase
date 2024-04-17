import type { PaginationInput, PaginationRequest } from "metabase-types/api";

export const getPaginationRequestParams = (
  input: PaginationInput,
): PaginationRequest => {
  if (!input) {
    return {};
  }

  const { page = 0, pageSize = 50 } = input;

  return {
    limit: pageSize,
    offset: page * pageSize,
  };
};
