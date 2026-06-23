import type { RemoveCloudAddOnRequest } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export {
  useListAddOnsQuery,
  usePurchaseCloudAddOnMutation,
} from "metabase/api/cloud-add-ons";

export const cloudAddOnApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    removeCloudAddOn: builder.mutation<void, RemoveCloudAddOnRequest>({
      query: ({ product_type }) => ({
        method: "DELETE",
        url: `/api/ee/cloud-add-ons/${product_type}`,
      }),
    }),
  }),
});

export const { useRemoveCloudAddOnMutation } = cloudAddOnApi;
