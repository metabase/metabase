import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export type ProductAnalyticsSiteId = number;

export type ProductAnalyticsSite = {
  id: ProductAnalyticsSiteId;
  name: string;
  allowed_domains: string;
  uuid: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductAnalyticsSiteDetails = ProductAnalyticsSite & {
  tracking_snippet: string;
};

export type CreateProductAnalyticsSiteRequest = {
  name: string;
  allowed_domains: string;
};

export const productAnalyticsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listProductAnalyticsSites: builder.query<ProductAnalyticsSite[], void>({
      query: () => `/api/ee/product-analytics/sites`,
      providesTags: (sites = []) => [
        listTag("product-analytics-site"),
        ...sites.map((site) => idTag("product-analytics-site", site.id)),
      ],
    }),
    getProductAnalyticsSite: builder.query<
      ProductAnalyticsSiteDetails,
      ProductAnalyticsSiteId
    >({
      query: (id) => `/api/ee/product-analytics/sites/${id}`,
      providesTags: (_, __, id) => [idTag("product-analytics-site", id)],
    }),
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
  useListProductAnalyticsSitesQuery,
  useGetProductAnalyticsSiteQuery,
  useCreateProductAnalyticsSiteMutation,
  useDeleteProductAnalyticsSiteMutation,
} = productAnalyticsApi;
