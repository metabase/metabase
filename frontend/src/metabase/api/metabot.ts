import type { PurchaseMetabotAddOnRequest } from "metabase-types/api/metabot";

import { Api } from "./api";

export const metabotCloudAddOnApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    purchaseMetabotCloudAddOn: builder.mutation<
      void,
      PurchaseMetabotAddOnRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/cloud-add-ons/metabase-ai",
        body,
      }),
    }),
  }),
});

export const { usePurchaseMetabotCloudAddOnMutation } = metabotCloudAddOnApi;
