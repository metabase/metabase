import { ActionsSectionLayout } from "metabase/data-studio/app/pages/ActionsSectionLayout";
import { Route } from "metabase/router";

/**
 * The action pages, in one chunk, so moving between an action's tabs costs no fetch.
 */
const actionsPage = () =>
  import(/* webpackChunkName: "data-actions" */ "./pages/ActionsPage").then(
    ({ ActionsPage }) => ({ Component: ActionsPage }),
  );

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
    <Route path="actions" element={<ActionsSectionLayout />}>
      <Route index lazy={actionsPage} />
      <Route path="new" lazy={newActionPage} />
      <Route path="archived" lazy={archivedActionsPage} />
      <Route path=":actionId" lazy={actionQueryPage} />
      <Route path=":actionId/edit" lazy={actionQueryPage} />
      <Route path=":actionId/fields" lazy={actionFieldsPage} />
      <Route path=":actionId/fields/:fieldId" lazy={actionFieldsPage} />
      <Route path=":actionId/run" lazy={actionRunPage} />
      <Route path=":actionId/settings" lazy={actionSettingsPage} />
    </Route>
  );
}
