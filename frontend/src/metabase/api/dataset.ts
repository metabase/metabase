import { Api } from "metabase/api";
import type { NativeQueryForm, DatasetQuery } from "metabase-types/api";

export const datasetApi = Api.injectEndpoints({
  endpoints: builder => ({
    getNativeDataset: builder.query<NativeQueryForm, DatasetQuery>({
      query: input => ({
        method: "POST",
        url: "/api/dataset/native",
        body: input,
      }),
    }),
  }),
});

export const { useGetNativeDatasetQuery } = datasetApi;
