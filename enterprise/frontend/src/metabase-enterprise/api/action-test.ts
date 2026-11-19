import type {
  ActionTest,
  ActionTestId,
  ListActionTestsRequest,
  RunActionTestResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideActionTestListTags,
  provideActionTestTags,
} from "./tags";

export const actionTestApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listActionTests: builder.query<ActionTest[], ListActionTestsRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/action-test",
        params,
      }),
      providesTags: (tests = []) => provideActionTestListTags(tests),
    }),
    getActionTest: builder.query<ActionTest, ActionTestId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/action-test/${id}`,
      }),
      providesTags: (test) => (test ? provideActionTestTags(test) : []),
    }),
    runActionTest: builder.mutation<RunActionTestResponse, ActionTestId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/action-test/${id}/run`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("action-test"),
          idTag("action-test", id),
          listTag("data-test-run"),
        ]),
    }),
  }),
});

export const {
  useListActionTestsQuery,
  useGetActionTestQuery,
  useRunActionTestMutation,
} = actionTestApi;
