import { EnterpriseApi } from "metabase-enterprise/api/api";

import type {
  WorkloadGridResponse,
  WorkloadQueryParams,
  WorkloadSlotRow,
} from "./types";

const TAG_GRID = { type: "workload-grid", id: "ALL" } as const;
const TAG_SLOT = { type: "workload-slot", id: "ALL" } as const;

export const workloadApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkloadGrid: builder.query<WorkloadGridResponse, WorkloadQueryParams>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/introspector/workload/grid",
        params,
      }),
      providesTags: [TAG_GRID],
    }),
    getWorkloadSlot: builder.query<WorkloadSlotRow[], WorkloadQueryParams>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/introspector/workload/slot",
        params,
      }),
      providesTags: [TAG_SLOT],
    }),
  }),
});

export const { useGetWorkloadGridQuery, useGetWorkloadSlotQuery } = workloadApi;
