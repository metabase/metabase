import { IndexRedirect, Route } from "react-router";

import { ModalRoute } from "metabase/hoc/ModalRoute";

import { TaskListPage } from "./components/TaskListPage";
import { TaskModal } from "./components/TaskModal";
import { TaskRunDetailsPage } from "./components/TaskRunDetailsPage";
import { TaskRunsPage } from "./components/TaskRunsPage";

export const getTasksRoutes = () => (
  <>
    <IndexRedirect to="list" />
    <Route path="list" component={TaskListPage}>
      <ModalRoute
        path=":taskId"
        modal={TaskModal}
        modalProps={{
          disableEventSandbox: true,
        }}
      />
    </Route>
    <Route path="runs" component={TaskRunsPage} />
    <Route path="runs/:runId" component={TaskRunDetailsPage} />
  </>
);
