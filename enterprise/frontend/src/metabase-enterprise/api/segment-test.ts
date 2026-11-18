import type {
  ListSegmentTestsRequest,
  RunSegmentTestResponse,
  SegmentTest,
  SegmentTestId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideSegmentTestListTags,
  provideSegmentTestTags,
} from "./tags";

export const segmentTestApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSegmentTests: builder.query<SegmentTest[], ListSegmentTestsRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/segment-test",
        params,
      }),
      providesTags: (tests = []) => provideSegmentTestListTags(tests),
    }),
    getSegmentTest: builder.query<SegmentTest, SegmentTestId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/segment-test/${id}`,
      }),
      providesTags: (test) => (test ? provideSegmentTestTags(test) : []),
    }),
    runSegmentTest: builder.mutation<RunSegmentTestResponse, SegmentTestId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/segment-test/${id}/run`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("segment-test"),
          idTag("segment-test", id),
          listTag("data-test-run"),
        ]),
    }),
  }),
});

export const {
  useListSegmentTestsQuery,
  useGetSegmentTestQuery,
  useRunSegmentTestMutation,
} = segmentTestApi;
