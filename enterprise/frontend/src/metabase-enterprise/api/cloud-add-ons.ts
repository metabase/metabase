import type { PurchaseCloudAddOnRequest } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const cloudAddOnApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    purchaseCloudAddOn: builder.mutation<void, PurchaseCloudAddOnRequest>({
      query: ({ product_type, ...body }) => ({
        method: "POST",
        url: `/api/ee/cloud-add-ons/${product_type}`,
        body,
      }),
    }),
  }),
});

export const { usePurchaseCloudAddOnMutation } = cloudAddOnApi;
