import { Route } from "metabase/router";

/**
 * The action pages, in one chunk, so moving between an action's tabs costs no fetch.
 */
const archivedActionsPage = () =>
  import(
    /* webpackChunkName: "data-actions" */ "./pages/ArchivedActionsPage"
  ).then(({ ArchivedActionsPage }) => ({ Component: ArchivedActionsPage }));

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
    <>
      <Route path="actions/new" lazy={newActionPage} />
      <Route path="actions/archived" lazy={archivedActionsPage} />
      <Route path="actions/:actionId" lazy={actionQueryPage} />
      <Route path="actions/:actionId/edit" lazy={actionQueryPage} />
      <Route path="actions/:actionId/fields" lazy={actionFieldsPage} />
      <Route path="actions/:actionId/fields/:fieldId" lazy={actionFieldsPage} />
      <Route path="actions/:actionId/run" lazy={actionRunPage} />
      <Route path="actions/:actionId/settings" lazy={actionSettingsPage} />
    </>
  );
}
