import { EnterpriseApi } from "./api";

export type MetabotUsageQuota = {
  usage: number;
  locked: boolean;
  updated_at: string;
  quota_type: string;
  hosting_feature: string;
  soft_limit: number;
};

export type MetabotUsageResponse = {
  quotas: MetabotUsageQuota[] | null;
};

export const metabotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMetabotUsage: builder.query<MetabotUsageResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot/usage",
      }),
    }),
  }),
});

export const { useGetMetabotUsageQuery } = metabotApi;
