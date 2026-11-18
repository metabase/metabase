import type {
  CardTest,
  CardTestId,
  ListCardTestsRequest,
  RunCardTestResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideCardTestListTags,
  provideCardTestTags,
} from "./tags";

export const cardTestApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listCardTests: builder.query<CardTest[], ListCardTestsRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/card-test",
        params,
      }),
      providesTags: (tests = []) => provideCardTestListTags(tests),
    }),
    getCardTest: builder.query<CardTest, CardTestId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/card-test/${id}`,
      }),
      providesTags: (test) => (test ? provideCardTestTags(test) : []),
    }),
    runCardTest: builder.mutation<RunCardTestResponse, CardTestId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/card-test/${id}/run`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("card-test"),
          idTag("card-test", id),
          listTag("data-test-run"),
        ]),
    }),
  }),
});

export const {
  useListCardTestsQuery,
  useGetCardTestQuery,
  useRunCardTestMutation,
} = cardTestApi;
