import { IndexRedirect, Route } from "react-router";

import { TaskDetailsPage } from "./components/TaskDetailsPage";
import { TaskListPage } from "./components/TaskListPage";
import { TaskRunDetailsPage } from "./components/TaskRunDetailsPage";
import { TaskRunsPage } from "./components/TaskRunsPage";

export const getTasksRoutes = () => (
  <>
    <IndexRedirect to="list" />
    <Route path="list" component={TaskListPage} />
    <Route path="list/:taskId" component={TaskDetailsPage} />
    <Route path="runs" component={TaskRunsPage} />
    <Route path="runs/:runId" component={TaskRunDetailsPage} />
  </>
);
