import { Route, redirect } from "metabase/router";

import { TaskDetailsPage } from "./components/TaskDetailsPage";
import { TaskListPage } from "./components/TaskListPage";
import { TaskRunDetailsPage } from "./components/TaskRunDetailsPage";
import { TaskRunsPage } from "./components/TaskRunsPage";

export const getTasksRoutes = () => (
  <>
    <Route index element={redirect("list")} />
    <Route path="list" element={<TaskListPage />} />
    <Route path="list/:taskId" element={<TaskDetailsPage />} />
    <Route path="runs" element={<TaskRunsPage />} />
    <Route path="runs/:runId" element={<TaskRunDetailsPage />} />
  </>
);

export { getRoutes as getNotificationsRoutes } from "./notifications/routes";
