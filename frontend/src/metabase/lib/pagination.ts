import type { PaginationInput, PaginationRequest } from "metabase-types/api";

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 50;

export const getPaginationRequestParams = (
  input: PaginationInput,
): PaginationRequest => {
  if (!input) {
    return {};
  }

  const { page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE } = input;

  return {
    limit: pageSize,
    offset: page * pageSize,
  };
};
