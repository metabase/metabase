import type { NativeQueryForm, DatasetQuery } from "metabase-types/api";

import { Api } from "./api";

export const datasetApi = Api.injectEndpoints({
  endpoints: builder => ({
    getNativeDataset: builder.query<NativeQueryForm, DatasetQuery>({
      query: body => ({
        method: "POST",
        url: "/api/dataset/native",
        body,
      }),
    }),
  }),
});

export const { useGetNativeDatasetQuery } = datasetApi;
