import { Fragment } from "react";
import { IndexRoute, IndexRedirect } from "react-router";
import { routerActions } from "react-router-redux";
import { UserAuthWrapper } from "redux-auth-wrapper";
import { t } from "ttag";

import AdminApp from "metabase/admin/app/components/AdminApp";
import { CacheApp } from "metabase/admin/caching/components/CacheApp";
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp";
import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp";
import DataModelApp from "metabase/admin/datamodel/containers/DataModelApp";
import MetricApp from "metabase/admin/datamodel/containers/MetricApp";
import MetricListApp from "metabase/admin/datamodel/containers/MetricListApp";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp";
import SegmentListApp from "metabase/admin/datamodel/containers/SegmentListApp";
import { getMetadataRoutes } from "metabase/admin/datamodel/metadata/routes";
import { AdminPeopleApp } from "metabase/admin/people/containers/AdminPeopleApp";
import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import GroupDetailApp from "metabase/admin/people/containers/GroupDetailApp";
import GroupsListingApp from "metabase/admin/people/containers/GroupsListingApp";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import PeopleListingApp from "metabase/admin/people/containers/PeopleListingApp";
import UserActivationModal from "metabase/admin/people/containers/UserActivationModal";
import UserPasswordResetModal from "metabase/admin/people/containers/UserPasswordResetModal";
import UserSuccessModal from "metabase/admin/people/containers/UserSuccessModal";
import getAdminPermissionsRoutes from "metabase/admin/permissions/routes";
import { SettingsEditor } from "metabase/admin/settings/app/components/SettingsEditor";
import { Help } from "metabase/admin/tasks/components/Help";
import { Logs } from "metabase/admin/tasks/components/Logs";
import JobInfoApp from "metabase/admin/tasks/containers/JobInfoApp";
import JobTriggersModal from "metabase/admin/tasks/containers/JobTriggersModal";
import {
  ModelCacheRefreshJobs,
  ModelCacheRefreshJobModal,
} from "metabase/admin/tasks/containers/ModelCacheRefreshJobs";
import TaskModal from "metabase/admin/tasks/containers/TaskModal";
import TasksApp from "metabase/admin/tasks/containers/TasksApp";
import TroubleshootingApp from "metabase/admin/tasks/containers/TroubleshootingApp";
import Tools from "metabase/admin/tools/containers/Tools";
import {
  createAdminRouteGuard,
  createAdminRedirect,
} from "metabase/admin/utils";
import { withBackground } from "metabase/hoc/Background";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import {
  PLUGIN_ADMIN_ROUTES,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_ADMIN_TOOLS,
} from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";

import RedirectToAllowedSettings from "./settings/containers/RedirectToAllowedSettings";

const UserCanAccessTools = UserAuthWrapper({
  predicate: isEnabled => isEnabled,
  failureRedirectPath: "/admin",
  authSelector: state => {
    if (PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES.length > 0) {
      return true;
    }
    const isModelPersistenceEnabled = getSetting(
      state,
      "persisted-models-enabled",
    );
    const hasLoadedSettings = typeof isModelPersistenceEnabled === "boolean";
    return !hasLoadedSettings || isModelPersistenceEnabled;
  },
  wrapperDisplayName: "UserCanAccessTools",
  allowRedirectBack: false,
  redirectAction: routerActions.replace,
});

const getRoutes = (store, CanAccessSettings, IsAdmin) => (
  <Route
    path="/admin"
    component={withBackground("bg-white")(CanAccessSettings)}
  >
    <Route title={t`Admin`} component={AdminApp}>
      <IndexRoute component={RedirectToAllowedSettings} />
      <Route
        path="databases"
        title={t`Databases`}
        component={createAdminRouteGuard("databases")}
      >
        <IndexRoute component={DatabaseListApp} />
        <Route path="create" component={DatabaseEditApp} />
        <Route path=":databaseId" component={DatabaseEditApp} />
      </Route>
      <Route path="datamodel" component={createAdminRouteGuard("data-model")}>
        <Route title={t`Table Metadata`} component={DataModelApp}>
          {getMetadataRoutes()}
          <Route path="metrics" component={MetricListApp} />
          <Route path="metric/create" component={MetricApp} />
          <Route path="metric/:id" component={MetricApp} />
          <Route path="segments" component={SegmentListApp} />
          <Route path="segment/create" component={SegmentApp} />
          <Route path="segment/:id" component={SegmentApp} />
          <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
        </Route>
      </Route>
      {/* PEOPLE */}
      <Route path="people" component={createAdminRouteGuard("people")}>
        <Route title={t`People`} component={AdminPeopleApp}>
          <IndexRoute component={PeopleListingApp} />

          {/*NOTE: this must come before the other routes otherwise it will be masked by them*/}
          <Route path="groups" title={t`Groups`}>
            <IndexRoute component={GroupsListingApp} />
            <Route path=":groupId" component={GroupDetailApp} />
          </Route>

          <Route path="" component={PeopleListingApp}>
            <ModalRoute path="new" modal={NewUserModal} />
          </Route>

          <Route path=":userId" component={PeopleListingApp}>
            <IndexRedirect to="/admin/people" />
            <ModalRoute path="edit" modal={EditUserModal} />
            <ModalRoute path="success" modal={UserSuccessModal} />
            <ModalRoute path="reset" modal={UserPasswordResetModal} />
            <ModalRoute path="deactivate" modal={UserActivationModal} />
            <ModalRoute path="reactivate" modal={UserActivationModal} />
            {PLUGIN_ADMIN_USER_MENU_ROUTES.map(getRoutes => getRoutes(store))}
          </Route>
        </Route>
      </Route>
      {/* Troubleshooting */}
      <Route
        path="troubleshooting"
        component={createAdminRouteGuard("troubleshooting")}
      >
        <Route title={t`Troubleshooting`} component={TroubleshootingApp}>
          <IndexRedirect to="help" />
          <Route path="help" component={Help} />
          <Route path="tasks" component={TasksApp}>
            <ModalRoute path=":taskId" modal={TaskModal} />
          </Route>
          <Route path="jobs" component={JobInfoApp}>
            <ModalRoute
              path=":jobKey"
              modal={JobTriggersModal}
              modalProps={{ wide: true }}
            />
          </Route>
          <Route path="logs" component={Logs} />
        </Route>
      </Route>
      {/* SETTINGS */}
      <Route path="settings" component={createAdminRouteGuard("settings")}>
        <IndexRoute component={createAdminRedirect("setup", "general")} />
        <Route title={t`Settings`}>
          <Route path="*" component={SettingsEditor} />
        </Route>
      </Route>
      {/* PERMISSIONS */}
      <Route path="permissions" component={IsAdmin}>
        {getAdminPermissionsRoutes(store)}
      </Route>
      {/* TODO: Make this an enterprise-only plugin */}
      <Route path="caching" component={createAdminRouteGuard("caching")}>
        <IndexRoute title={t`Caching`} path="" component={CacheApp}>
          {/*
              perhaps eventually something like this will be useful:
          <IndexRedirect to={PLUGIN_ADMIN_CACHING.INDEX_ROUTE} />
          {PLUGIN_ADMIN_CACHING.EXTRA_ROUTES}
          */}
        </IndexRoute>
      </Route>
      <Route
        path="tools"
        component={UserCanAccessTools(createAdminRouteGuard("tools"))}
      >
        <Route title={t`Tools`} component={Tools}>
          <IndexRedirect to={PLUGIN_ADMIN_TOOLS.INDEX_ROUTE} />
          <Route
            path="model-caching"
            title={t`Model Caching Log`}
            component={ModelCacheRefreshJobs}
          >
            <ModalRoute path=":jobId" modal={ModelCacheRefreshJobModal} />
          </Route>
          {PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES}
        </Route>
      </Route>
      {/* PLUGINS */}
      <Fragment>
        {PLUGIN_ADMIN_ROUTES.map(getRoutes => getRoutes(store))}
      </Fragment>
    </Route>
  </Route>
);

export default getRoutes;
