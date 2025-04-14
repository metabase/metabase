import type {
  ListTasksRequest,
  ListTasksResponse,
  Task,
  TaskInfo,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideTaskListTags,
  provideTaskTags,
  provideUniqueTasksListTags,
} from "./tags";

export const taskApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTasks: builder.query<ListTasksResponse, ListTasksRequest | void>({
      query: (params) => ({
        method: "GET",
        url: "/api/task",
        params,
      }),
      providesTags: (response) =>
        response ? provideTaskListTags(response.data) : [],
    }),
    listUniqueTasks: builder.query<string[], void>({
      query: () => ({
        method: "GET",
        url: "/api/task/unique-tasks",
      }),
      providesTags: (response) =>
        response ? provideUniqueTasksListTags() : [],
    }),
    getTask: builder.query<Task, number>({
      query: (id) => ({
        method: "GET",
        url: `/api/task/${id}`,
      }),
      providesTags: (task) => (task ? provideTaskTags(task) : []),
    }),
    getTasksInfo: builder.query<TaskInfo, void>({
      query: () => ({
        method: "GET",
        url: "/api/task/info",
      }),
    }),
  }),
});

export const {
  useListTasksQuery,
  useListUniqueTasksQuery,
  useGetTaskQuery,
  useGetTasksInfoQuery,
} = taskApi;
