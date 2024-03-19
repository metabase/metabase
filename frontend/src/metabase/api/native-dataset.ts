import { Api } from "metabase/api";

export const nativeDatasetApi = Api.injectEndpoints({
  endpoints: builder => ({
    createNativeDataset: builder.mutation({
      query: input => ({
        method: "POST",
        url: "/api/dataset/native",
        body: input,
      }),
    }),
  }),
});

export const { useCreateNativeDatasetMutation } = nativeDatasetApi;
