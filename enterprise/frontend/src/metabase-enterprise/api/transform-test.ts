import type {
  ListTransformTestsRequest,
  RunTransformTestResponse,
  TransformTest,
  TransformTestId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTransformTestListTags,
  provideTransformTestTags,
} from "./tags";

export const transformTestApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listTransformTests: builder.query<
      TransformTest[],
      ListTransformTestsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/transform-test",
        params,
      }),
      providesTags: (tests = []) => provideTransformTestListTags(tests),
    }),
    getTransformTest: builder.query<TransformTest, TransformTestId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/transform-test/${id}`,
      }),
      providesTags: (test) => (test ? provideTransformTestTags(test) : []),
    }),
    runTransformTest: builder.mutation<
      RunTransformTestResponse,
      TransformTestId
    >({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/transform-test/${id}/run`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("transform-test"),
          idTag("transform-test", id),
          listTag("data-test-run"),
        ]),
    }),
  }),
});

export const {
  useListTransformTestsQuery,
  useGetTransformTestQuery,
  useRunTransformTestMutation,
} = transformTestApi;
