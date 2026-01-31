export interface PaginationRequest {
  limit?: number | null;
  offset?: number | null;
}

export interface PaginationResponse {
  limit: number | null;
  offset: number | null;
  total: number;
}
