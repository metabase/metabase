import type { Dashboard, DashboardId } from "metabase-types/api";

import { Api } from "./api";
import { provideDashboardTags } from "./tags";

export const dashboardApi = Api.injectEndpoints({
  endpoints: builder => ({
    getDashboard: builder.query<Dashboard, DashboardId>({
      query: id => ({
        method: "GET",
        url: `/api/dashboard/${id}`,
      }),
      providesTags: dashboard =>
        dashboard ? provideDashboardTags(dashboard) : [],
    }),
  }),
});

export const { useGetDashboardQuery } = dashboardApi;
