import { Navigate, type RouteObject, useParams } from "react-router-dom";

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

export const getTasksRoutes = () => null;

export const getTasksRouteObjects = (): RouteObject[] => [
  { index: true, element: <Navigate to="list" replace /> },
  { path: "list", element: <TaskListPage /> },
  { path: "list/:taskId", element: <TaskDetailsPageWithParams /> },
  { path: "runs", element: <TaskRunsPage /> },
  { path: "runs/:runId", element: <TaskRunDetailsPageWithParams /> },
];
