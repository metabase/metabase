import type { PurchaseCloudAddOnRequest } from "metabase-types/api";

import { Api } from "./api";

export const cloudAddOnApi = Api.injectEndpoints({
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
