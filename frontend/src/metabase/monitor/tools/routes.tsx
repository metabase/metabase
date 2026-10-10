import { Route, redirect } from "metabase/router";

/**
 * The task pages, in one chunk. Moving between the runs list, a run and its
 * tasks is one flow, so they arrive together.
 *
 * They sit under `components/` rather than a `pages/` directory, which is why
 * the route-file lint rule does not reach them.
 */
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
    <Route index lazy={taskRunsPage} />
    <Route path="jobs/:jobKey" lazy={taskRunsPage} />
    {/* old tab URLs */}
    <Route path="list" element={redirect("..")} />
    <Route path="runs" element={redirect("..")} />
    <Route path="list/:taskId" lazy={taskDetailsPage} />
    <Route path="runs/:runId" lazy={taskRunDetailsPage} />
  </>
);

export { getRoutes as getNotificationsRoutes } from "./notifications/routes";
