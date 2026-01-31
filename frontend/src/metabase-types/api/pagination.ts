export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface PaginationRequest {
  limit?: number | null;
  offset?: number | null;
}

export interface PaginationResponse {
  limit: number | null;
  offset: number | null;
  total: number;
}
