import { Route, redirect } from "metabase/router";

/**
 * The task pages, in one chunk. Moving between the task list, a task and its
 * runs is one flow, so they arrive together.
 *
 * They sit under `components/` rather than a `pages/` directory, which is why
 * the route-file lint rule does not reach them.
 */
const taskListPage = () =>
  import(
    /* webpackChunkName: "monitor-tasks" */ "./components/TaskListPage"
  ).then(({ TaskListPage }) => ({ Component: TaskListPage }));

const taskDetailsPage = () =>
  import(
    /* webpackChunkName: "monitor-tasks" */ "./components/TaskDetailsPage"
  ).then(({ TaskDetailsPage }) => ({ Component: TaskDetailsPage }));

const taskRunsPage = () =>
  import(
    /* webpackChunkName: "monitor-tasks" */ "./components/TaskRunsPage"
  ).then(({ TaskRunsPage }) => ({ Component: TaskRunsPage }));

const taskRunDetailsPage = () =>
  import(
    /* webpackChunkName: "monitor-tasks" */ "./components/TaskRunDetailsPage"
  ).then(({ TaskRunDetailsPage }) => ({ Component: TaskRunDetailsPage }));

export const getTasksRoutes = () => (
  <>
    <Route index element={redirect("list")} />
    <Route path="list" lazy={taskListPage} />
    <Route path="list/:taskId" lazy={taskDetailsPage} />
    <Route path="runs" lazy={taskRunsPage} />
    <Route path="runs/:runId" lazy={taskRunDetailsPage} />
  </>
);

export { getRoutes as getNotificationsRoutes } from "./notifications/routes";
