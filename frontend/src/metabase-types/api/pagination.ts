export interface PaginationRequest {
  limit?: number | null;
  offset?: number | null;
}

export interface PaginationResponse extends PaginationRequest {
  total: number;
}
