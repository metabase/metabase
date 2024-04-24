import type { ModelCacheRefreshStatus } from "./models";
import type { PaginationRequest, PaginationResponse } from "./pagination";

export type PersistedInfoId = number;

export type ListPersistedInfoRequest = PaginationRequest;

export type ListPersistedInfoResponse = {
  data: ModelCacheRefreshStatus[];
} & PaginationResponse;

export type PersistedInfoRefreshSchedule = {
  cron: string;
};
