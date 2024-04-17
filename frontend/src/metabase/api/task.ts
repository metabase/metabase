import type {
  ListTasksRequest,
  ListTasksResponse,
  Task,
} from "metabase-types/api";

import { Api } from "./api";

export const taskApi = Api.injectEndpoints({
  endpoints: builder => ({
    listTasks: builder.query<ListTasksResponse, ListTasksRequest>({
      query: params => ({
        method: "GET",
        url: "/api/task",
        params,
      }),
    }),
    getTask: builder.query<Task, number>({
      query: id => ({
        method: "GET",
        url: `/api/task/${id}`,
      }),
    }),
    getTasksInfo: builder.query<unknown, void>({
      query: () => ({
        method: "GET",
        url: "/api/task/info",
      }),
    }),
  }),
});

export const { useListTasksQuery, useGetTaskQuery, useGetTasksInfoQuery } =
  taskApi;
