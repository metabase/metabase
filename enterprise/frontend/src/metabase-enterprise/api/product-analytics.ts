import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export type ProductAnalyticsSiteId = number;

export type ProductAnalyticsSite = {
  id: ProductAnalyticsSiteId;
  origin: string;
  api_token: string;
};

export type CreateProductAnalyticsSiteRequest = {
  origin: string;
};

export const productAnalyticsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createProductAnalyticsSite: builder.mutation<
      ProductAnalyticsSite,
      CreateProductAnalyticsSiteRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/product-analytics/sites`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("product-analytics-site")]),
    }),
    deleteProductAnalyticsSite: builder.mutation<void, ProductAnalyticsSiteId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/product-analytics/sites/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("product-analytics-site"),
          idTag("product-analytics-site", id),
        ]),
    }),
  }),
});

export const {
  useCreateProductAnalyticsSiteMutation,
  useDeleteProductAnalyticsSiteMutation,
} = productAnalyticsApi;
