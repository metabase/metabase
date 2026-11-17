import type {
  ListTaskRunEntitiesRequest,
  ListTaskRunsRequest,
  ListTaskRunsResponse,
  ListTasksRequest,
  ListTasksResponse,
  RunEntity,
  Task,
  TaskCountsResponse,
  TaskInfo,
  TaskRunExtended,
} from "metabase-types/api";

import { Api } from "./api";
import {
  listTag,
  provideTaskListTags,
  provideTaskRunListTags,
  provideTaskRunTags,
  provideTaskTags,
  provideUniqueTasksListTags,
} from "./tags";

export const taskApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getTaskCounts: builder.query<TaskCountsResponse, void>({
      query: () => ({ method: "GET", url: "/api/task/counts" }),
      providesTags: [listTag("task"), listTag("task-run")],
    }),
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
  useGetTaskCountsQuery,
  useListTasksQuery,
  useLazyListTasksQuery,
  useListUniqueTasksQuery,
  useGetTaskQuery,
  useGetTasksInfoQuery,
  useListTaskRunsQuery,
  useLazyListTaskRunsQuery,
  useGetTaskRunQuery,
  useListTaskRunEntitiesQuery,
  useLazyListTaskRunEntitiesQuery,
} = taskApi;
