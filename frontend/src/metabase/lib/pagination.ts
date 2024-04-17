import type { PaginationInput, PaginationParams } from "metabase-types/api";

export const getPaginationParams = (
  input: PaginationInput,
): PaginationParams => {
  if (!input) {
    return {};
  }

  const { page = 0, pageSize = 50 } = input;

  return {
    limit: pageSize,
    offset: page * pageSize,
  };
};
