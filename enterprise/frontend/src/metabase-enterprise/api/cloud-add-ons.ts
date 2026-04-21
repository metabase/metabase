import type {
  GetCloudAddOnsResponse,
  PurchaseCloudAddOnRequest,
  RemoveCloudAddOnRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const cloudAddOnApi = EnterpriseApi.injectEndpoints({
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
    removeCloudAddOn: builder.mutation<void, RemoveCloudAddOnRequest>({
      query: ({ product_type }) => ({
        method: "DELETE",
        url: `/api/ee/cloud-add-ons/${product_type}`,
      }),
    }),
  }),
});
export const {
  useListAddOnsQuery,
  usePurchaseCloudAddOnMutation,
  useRemoveCloudAddOnMutation,
} = cloudAddOnApi;
