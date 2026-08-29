export type PaginationRequest = {
  limit?: number | null;
  offset?: number | null;
};

export type PaginationResponse = {
  limit: number | null;
  offset: number | null;
  total: number;
};
