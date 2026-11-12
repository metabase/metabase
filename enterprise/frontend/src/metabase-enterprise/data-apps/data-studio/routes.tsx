import type { ComponentType } from "react";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

const sectionLayout = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppsSectionLayout"
  ).then(({ DataAppsSectionLayout }) => ({ Component: DataAppsSectionLayout }));

const listPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppListPage"
  ).then(({ DataAppListPage }) => ({ Component: DataAppListPage }));

const overviewPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppOverviewPage"
  ).then(({ DataAppOverviewPage }) => ({ Component: DataAppOverviewPage }));

const questionsPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppQuestionsPage"
  ).then(({ DataAppQuestionsPage }) => ({ Component: DataAppQuestionsPage }));

const actionsPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppActionsPage"
  ).then(({ DataAppActionsPage }) => ({ Component: DataAppActionsPage }));

const questionPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppQuestionPage"
  ).then(({ DataAppQuestionPage }) => ({ Component: DataAppQuestionPage }));

const questionDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppQuestionDependenciesPage"
  ).then(({ DataAppQuestionDependenciesPage }) => ({
    Component: DataAppQuestionDependenciesPage,
  }));

const permissionsPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppPermissionsPage"
  ).then(({ DataAppPermissionsPage }) => ({
    Component: DataAppPermissionsPage,
  }));

const actionDefinitionPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppActionDefinitionPage"
  ).then(({ DataAppActionDefinitionPage }) => ({
    Component: DataAppActionDefinitionPage,
  }));

const actionFieldsPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppActionFieldsPage"
  ).then(({ DataAppActionFieldsPage }) => ({
    Component: DataAppActionFieldsPage,
  }));

const actionDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppActionDependenciesPage"
  ).then(({ DataAppActionDependenciesPage }) => ({
    Component: DataAppActionDependenciesPage,
  }));

export function getDataStudioDataAppRoutes(IsAdmin: ComponentType) {
  return (
    <Route path={Urls.DATA_APP_URL_SEGMENT} element={<IsAdmin />}>
      <Route lazy={sectionLayout}>
        <Route index lazy={listPage} />
        <Route path=":slug" lazy={overviewPage} />
        <Route path=":slug/questions" lazy={questionsPage} />
        <Route path=":slug/actions" lazy={actionsPage} />
        <Route path=":slug/permissions" lazy={permissionsPage} />
        <Route path=":slug/questions/:cardId" lazy={questionPage} />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route
            path=":slug/questions/:cardId/dependencies"
            lazy={questionDependenciesPage}
          >
            <Route
              index
              element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />}
            />
          </Route>
        )}
        <Route path=":slug/actions/:actionId" lazy={actionDefinitionPage} />
        <Route path=":slug/actions/:actionId/fields" lazy={actionFieldsPage} />
        <Route
          path=":slug/actions/:actionId/fields/:fieldId"
          lazy={actionFieldsPage}
        />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route
            path=":slug/actions/:actionId/dependencies"
            lazy={actionDependenciesPage}
          >
            <Route
              index
              element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />}
            />
          </Route>
        )}
      </Route>
    </Route>
  );
}
