import { IndexRedirect, Route } from "react-router";

import { ModalRoute } from "metabase/hoc/ModalRoute";

import { TaskListPage } from "./components/TaskListPage";
import { TaskModal } from "./components/TaskModal";
import { TaskRunModal } from "./components/TaskRunModal";
import { TaskRunsPage } from "./components/TaskRunsPage";

export const getTasksRoutes = () => (
  <>
    <IndexRedirect to="runs" />
    <Route path="runs" component={TaskRunsPage}>
      <ModalRoute path=":runId" modal={TaskRunModal} />
    </Route>
    <Route path="list" component={TaskListPage}>
      <ModalRoute
        path=":taskId"
        modal={TaskModal}
        modalProps={{
          disableEventSandbox: true,
        }}
      />
    </Route>
  </>
);
