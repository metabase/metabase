export interface PaginationRequest {
  limit?: number;
  offset?: number;
}

export interface PaginationResponse {
  limit: number;
  offset: number;
  total: number;
}
