import type {
  ListTasksRequest,
  ListTasksResponse,
  Task,
  TaskInfo,
} from "metabase-types/api";

import { Api } from "./api";
import { provideTaskTags, provideTaskListTags } from "./tags";

export const taskApi = Api.injectEndpoints({
  endpoints: builder => ({
    listTasks: builder.query<ListTasksResponse, ListTasksRequest | void>({
      query: params => ({
        method: "GET",
        url: "/api/task",
        params,
      }),
      providesTags: response =>
        response ? provideTaskListTags(response.data) : [],
    }),
    getTask: builder.query<Task, number>({
      query: id => ({
        method: "GET",
        url: `/api/task/${id}`,
      }),
      providesTags: task => (task ? provideTaskTags(task) : []),
    }),
    getTasksInfo: builder.query<TaskInfo, void>({
      query: () => ({
        method: "GET",
        url: "/api/task/info",
      }),
    }),
  }),
});

export const { useListTasksQuery, useGetTaskQuery, useGetTasksInfoQuery } =
  taskApi;
