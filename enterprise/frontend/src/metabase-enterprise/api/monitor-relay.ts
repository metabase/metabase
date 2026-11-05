import type { MonitorRelayStatus } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const monitorRelayApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMonitorRelayStatus: builder.query<MonitorRelayStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/monitor-relay/status",
      }),
      // a new URL changes the status at once
      providesTags: ["session-properties"],
    }),
  }),
});

export const { useGetMonitorRelayStatusQuery } = monitorRelayApi;
