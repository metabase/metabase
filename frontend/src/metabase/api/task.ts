import type {
  ListTaskRunEntitiesRequest,
  ListTaskRunsRequest,
  ListTaskRunsResponse,
  ListTasksRequest,
  ListTasksResponse,
  RunEntity,
  Task,
  TaskInfo,
  TaskRunExtended,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideTaskListTags,
  provideTaskRunListTags,
  provideTaskRunTags,
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
    listTaskRuns: builder.query<
      ListTaskRunsResponse,
      ListTaskRunsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/task/runs",
        params,
      }),
      providesTags: (response) =>
        response ? provideTaskRunListTags(response.data) : [],
    }),
    getTaskRun: builder.query<TaskRunExtended, number>({
      query: (id) => ({
        method: "GET",
        url: `/api/task/runs/${id}`,
      }),
      providesTags: (taskRun) => (taskRun ? provideTaskRunTags(taskRun) : []),
    }),
    listTaskRunEntities: builder.query<RunEntity[], ListTaskRunEntitiesRequest>(
      {
        query: (params) => ({
          method: "GET",
          url: "/api/task/runs/entities",
          params,
        }),
      },
    ),
  }),
});

export const {
  useListTasksQuery,
  useListUniqueTasksQuery,
  useGetTaskQuery,
  useGetTasksInfoQuery,
  useListTaskRunsQuery,
  useGetTaskRunQuery,
  useListTaskRunEntitiesQuery,
} = taskApi;
