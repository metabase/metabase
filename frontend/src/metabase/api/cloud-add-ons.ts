import type {
  GetCloudAddOnsResponse,
  PurchaseCloudAddOnRequest,
} from "metabase-types/api";

import { Api } from "./api";

// OSS-accessible client for the EE `/api/ee/cloud-add-ons` endpoints, mirroring `cloud-proxy.ts`.
// These endpoints only exist on Metabase Cloud (hosted, always-EE) instances; the upsells that use
// them are gated on `is-hosted?`, so the routes are always present at runtime.
export const cloudAddOnApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listAddOns: builder.query<GetCloudAddOnsResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/cloud-add-ons/addons",
      }),
    }),
    purchaseCloudAddOn: builder.mutation<void, PurchaseCloudAddOnRequest>({
      query: ({ product_type, ...body }) => ({
        method: "POST",
        url: `/api/ee/cloud-add-ons/${product_type}`,
        body,
      }),
    }),
  }),
});

export const { useListAddOnsQuery, usePurchaseCloudAddOnMutation } =
  cloudAddOnApi;
