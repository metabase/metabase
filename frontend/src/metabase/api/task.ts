import type { Task } from "metabase-types/api";

import { Api } from "./api";

export const taskApi = Api.injectEndpoints({
  endpoints: builder => ({
    listTasks: builder.query<unknown, void>({
      query: () => ({
        method: "GET",
        url: "/api/task",
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
