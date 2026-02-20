import { Navigate, type RouteObject, useParams } from "react-router-dom";

import { IndexRedirect, Route } from "metabase/routing/compat/react-router-v3";

import { TaskDetailsPage } from "./components/TaskDetailsPage";
import { TaskListPage } from "./components/TaskListPage";
import { TaskRunDetailsPage } from "./components/TaskRunDetailsPage";
import { TaskRunsPage } from "./components/TaskRunsPage";

const TaskDetailsPageWithParams = () => {
  const params = useParams<{ taskId: string }>();
  return <TaskDetailsPage params={{ taskId: Number(params.taskId) }} />;
};

const TaskRunDetailsPageWithParams = () => {
  const params = useParams<{ runId: string }>();
  return <TaskRunDetailsPage params={{ runId: Number(params.runId) }} />;
};

export const getTasksRoutes = () => (
  <>
    <IndexRedirect to="list" />
    <Route path="list" component={TaskListPage} />
    <Route path="list/:taskId" component={TaskDetailsPage} />
    <Route path="runs" component={TaskRunsPage} />
    <Route path="runs/:runId" component={TaskRunDetailsPage} />
  </>
);

export const getTasksRouteObjects = (): RouteObject[] => [
  { index: true, element: <Navigate to="list" replace /> },
  { path: "list", element: <TaskListPage /> },
  { path: "list/:taskId", element: <TaskDetailsPageWithParams /> },
  { path: "runs", element: <TaskRunsPage /> },
  { path: "runs/:runId", element: <TaskRunDetailsPageWithParams /> },
];
