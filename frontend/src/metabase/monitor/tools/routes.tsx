import { Route, redirect, withRouteProps } from "metabase/router";

import { TaskDetailsPage } from "./components/TaskDetailsPage";
import { TaskListPage } from "./components/TaskListPage";
import { TaskRunDetailsPage } from "./components/TaskRunDetailsPage";
import { TaskRunsPage } from "./components/TaskRunsPage";

const RoutedTaskListPage = withRouteProps(TaskListPage);
const RoutedTaskDetailsPage = withRouteProps(TaskDetailsPage);
const RoutedTaskRunDetailsPage = withRouteProps(TaskRunDetailsPage);

export const getTasksRoutes = () => (
  <>
    <Route index element={redirect("list")} />
    <Route path="list" element={<RoutedTaskListPage />} />
    <Route path="list/:taskId" element={<RoutedTaskDetailsPage />} />
    <Route path="runs" element={<TaskRunsPage />} />
    <Route path="runs/:runId" element={<RoutedTaskRunDetailsPage />} />
  </>
);

export { getRoutes as getNotificationsRoutes } from "./notifications/routes";
