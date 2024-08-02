import type { BillingInfo } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const billingInfoApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    getBillingInfo: builder.query<BillingInfo, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/billing",
      }),
    }),
  }),
});

export const { useGetBillingInfoQuery } = billingInfoApi;
