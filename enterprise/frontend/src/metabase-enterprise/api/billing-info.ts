import { Api } from "metabase/api";
import type { BillingInfo } from "metabase-types/api";

export const billingInfoApi = Api.injectEndpoints({
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
