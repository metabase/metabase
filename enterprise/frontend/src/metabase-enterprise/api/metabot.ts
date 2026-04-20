import { EnterpriseApi } from "./api";

export type MetabotUsageResponse = {
  tokens: number | null;
  "free-tokens": number | null;
  "updated-at": string | null;
  "is-locked": boolean;
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
