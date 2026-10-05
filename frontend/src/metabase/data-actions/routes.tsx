import { Route } from "metabase/router";

import { ActionsEnabledOnSomeDatabase } from "./route-guards";

/**
 * The action pages, in one chunk, so moving between an action's tabs costs no fetch.
 */
const actionListPage = () =>
  import(/* webpackChunkName: "data-actions" */ "./pages/ActionListPage").then(
    ({ ActionListPage }) => ({ Component: ActionListPage }),
  );

const newActionPage = () =>
  import(/* webpackChunkName: "data-actions" */ "./pages/NewActionPage").then(
    ({ NewActionPage }) => ({ Component: NewActionPage }),
  );

const actionQueryPage = () =>
  import(/* webpackChunkName: "data-actions" */ "./pages/ActionQueryPage").then(
    ({ ActionQueryPage }) => ({ Component: ActionQueryPage }),
  );

const actionFieldsPage = () =>
  import(
    /* webpackChunkName: "data-actions" */ "./pages/ActionFieldsPage"
  ).then(({ ActionFieldsPage }) => ({ Component: ActionFieldsPage }));

const actionRunPage = () =>
  import(/* webpackChunkName: "data-actions" */ "./pages/ActionRunPage").then(
    ({ ActionRunPage }) => ({ Component: ActionRunPage }),
  );

const actionSettingsPage = () =>
  import(
    /* webpackChunkName: "data-actions" */ "./pages/ActionSettingsPage"
  ).then(({ ActionSettingsPage }) => ({ Component: ActionSettingsPage }));

export function getDataStudioActionRoutes() {
  return (
    <Route element={<ActionsEnabledOnSomeDatabase />}>
      <Route index lazy={actionListPage} />
      <Route path="new" lazy={newActionPage} />
      <Route path=":actionId" lazy={actionQueryPage} />
      <Route path=":actionId/edit" lazy={actionQueryPage} />
      <Route path=":actionId/fields" lazy={actionFieldsPage} />
      <Route path=":actionId/fields/:fieldId" lazy={actionFieldsPage} />
      <Route path=":actionId/run" lazy={actionRunPage} />
      <Route path=":actionId/settings" lazy={actionSettingsPage} />
    </Route>
  );
}
