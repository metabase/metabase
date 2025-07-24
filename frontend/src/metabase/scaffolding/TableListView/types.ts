import type { TableId } from "metabase-types/api";

export interface RouteParams {
  page?: string;
  tableId: string;
}

export type ParsedRouteParams = {
  page: number;
  tableId: TableId;
};
