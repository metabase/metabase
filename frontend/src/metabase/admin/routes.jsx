import { Fragment } from "react";
import { IndexRedirect, IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import AdminApp from "metabase/admin/app/components/AdminApp";
import { DatabaseConnectionModal } from "metabase/admin/databases/containers/DatabaseConnectionModal";
import { DatabaseEditApp } from "metabase/admin/databases/containers/DatabaseEditApp";
import { DatabaseListApp } from "metabase/admin/databases/containers/DatabaseListApp";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp";
import SegmentListApp from "metabase/admin/datamodel/containers/SegmentListApp";
import { AdminPeopleApp } from "metabase/admin/people/containers/AdminPeopleApp";
import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import { GroupDetailApp } from "metabase/admin/people/containers/GroupDetailApp";
import { GroupsListingApp } from "metabase/admin/people/containers/GroupsListingApp";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import { PeopleListingApp } from "metabase/admin/people/containers/PeopleListingApp";
import { UserActivationModal } from "metabase/admin/people/containers/UserActivationModal";
import { UserPasswordResetModal } from "metabase/admin/people/containers/UserPasswordResetModal";
import { UserSuccessModal } from "metabase/admin/people/containers/UserSuccessModal";
import { PerformanceApp } from "metabase/admin/performance/components/PerformanceApp";
import getAdminPermissionsRoutes from "metabase/admin/permissions/routes";
import { Help } from "metabase/admin/tools/components/Help";
import { JobInfoApp } from "metabase/admin/tools/components/JobInfoApp";
import { JobTriggersModal } from "metabase/admin/tools/components/JobTriggersModal";
import { LogLevelsModal } from "metabase/admin/tools/components/LogLevelsModal";
import { Logs } from "metabase/admin/tools/components/Logs";
import {
  ModelCachePage,
  ModelCacheRefreshJobModal,
} from "metabase/admin/tools/components/ModelCacheRefreshJobs";
import { TaskModal } from "metabase/admin/tools/components/TaskModal";
import { TasksApp } from "metabase/admin/tools/components/TasksApp";
import { ToolsApp } from "metabase/admin/tools/components/ToolsApp";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import { DataModel } from "metabase/metadata/pages/DataModel";
import {
  PLUGIN_ADMIN_TOOLS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_CACHING,
  PLUGIN_DB_ROUTING,
  PLUGIN_METABOT,
} from "metabase/plugins";

import { ModelPersistenceConfiguration } from "./performance/components/ModelPersistenceConfiguration";
import { StrategyEditorForDatabases } from "./performance/components/StrategyEditorForDatabases";
import { PerformanceTabId } from "./performance/types";
import { getSettingsRoutes } from "./settingsRoutes";
import { ToolsUpsell } from "./tools/components/ToolsUpsell";
import { RedirectToAllowedSettings, createAdminRouteGuard } from "./utils";

const getRoutes = (store, CanAccessSettings, IsAdmin) => (
  <Route path="/admin" component={CanAccessSettings}>
    <Route title={t`Admin`} component={AdminApp}>
      <IndexRoute component={RedirectToAllowedSettings} />
      <Route
        path="databases"
        title={t`Databases`}
        component={createAdminRouteGuard("databases")}
      >
        <IndexRoute component={DatabaseListApp} />
        <Route component={DatabaseListApp}>
          <Route component={IsAdmin}>
            <ModalRoute path="create" modal={DatabaseConnectionModal} noWrap />
          </Route>
        </Route>
        <Route path=":databaseId" component={DatabaseEditApp}>
          <ModalRoute path="edit" modal={DatabaseConnectionModal} noWrap />
          {PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes(IsAdmin)}
        </Route>
      </Route>
      <Route path="datamodel" component={createAdminRouteGuard("data-model")}>
        <Route title={t`Table Metadata`}>
          <IndexRedirect to="database" />
          <Route path="database" component={DataModel} />
          <Route path="database/:databaseId" component={DataModel} />
          <Route
            path="database/:databaseId/schema/:schemaId"
            component={DataModel}
          />
          <Route
            path="database/:databaseId/schema/:schemaId/table/:tableId"
            component={DataModel}
          />
          <Route
            path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
            component={DataModel}
          />
          <Route component={DataModel}>
            <Route path="segments" component={SegmentListApp} />
            <Route path="segment/create" component={SegmentApp} />
            <Route path="segment/:id" component={SegmentApp} />
            <Route
              path="segment/:id/revisions"
              component={RevisionHistoryApp}
            />
          </Route>
          <Redirect
            from="database/:databaseId/schema/:schemaId/table/:tableId/settings"
            to="database/:databaseId/schema/:schemaId/table/:tableId"
          />
          <Redirect
            from="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
            to="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
          />
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
            <ModalRoute path="new" modal={NewUserModal} noWrap />
          </Route>

          <Route path=":userId" component={PeopleListingApp}>
            <IndexRedirect to="/admin/people" />
            <ModalRoute path="edit" modal={EditUserModal} noWrap />
            <ModalRoute path="success" modal={UserSuccessModal} noWrap />
            <ModalRoute path="reset" modal={UserPasswordResetModal} noWrap />
            <ModalRoute path="deactivate" modal={UserActivationModal} noWrap />
            <ModalRoute path="reactivate" modal={UserActivationModal} noWrap />
            {PLUGIN_ADMIN_USER_MENU_ROUTES.map((getRoutes, index) => (
              <Fragment key={index}>{getRoutes(store)}</Fragment>
            ))}
          </Route>
        </Route>
      </Route>
      {/* SETTINGS */}
      <Route path="settings" component={createAdminRouteGuard("settings")}>
        {getSettingsRoutes()}
      </Route>
      {/* PERMISSIONS */}
      <Route path="permissions" component={IsAdmin}>
        {getAdminPermissionsRoutes(store)}
      </Route>
      {/* PERFORMANCE */}
      <Route
        path="performance"
        component={createAdminRouteGuard("performance")}
      >
        <Route title={t`Performance`} component={PerformanceApp}>
          <IndexRedirect to={PerformanceTabId.Databases} />
          <Route
            path="databases"
            title={t`Databases`}
            component={StrategyEditorForDatabases}
          />
          <Route
            path="models"
            title={t`Models`}
            component={ModelPersistenceConfiguration}
          />
          <Route
            path="dashboards-and-questions"
            title={t`Dashboards and questions`}
            component={PLUGIN_CACHING.StrategyEditorForQuestionsAndDashboards}
          />
        </Route>
      </Route>
      {PLUGIN_METABOT.getAdminRoutes()}
      <Route path="tools" component={createAdminRouteGuard("tools")}>
        <Route title={t`Tools`} component={ToolsApp}>
          <IndexRedirect to="help" />
          <Route
            key="error-overview"
            path="errors"
            title={t`Erroring Questions`}
            // If the audit_app feature flag is present, our enterprise plugin system kicks in and we render the
            // appropriate enterprise component. The upsell component is shown in all other cases.
            component={PLUGIN_ADMIN_TOOLS.COMPONENT || ToolsUpsell}
          />
          <Route
            path="model-caching"
            title={t`Model Caching Log`}
            component={ModelCachePage}
          >
            <ModalRoute path=":jobId" modal={ModelCacheRefreshJobModal} />
          </Route>
          <Route path="help" component={Help} />
          <Route path="tasks" component={TasksApp}>
            <ModalRoute
              path=":taskId"
              modal={TaskModal}
              modalProps={{
                // EventSandbox interferes with mouse text selection in CodeMirror editor
                disableEventSandbox: true,
              }}
            />
          </Route>
          <Route path="jobs" component={JobInfoApp}>
            <ModalRoute
              path=":jobKey"
              modal={JobTriggersModal}
              modalProps={{ wide: true }}
            />
          </Route>
          <Route path="logs" component={Logs}>
            <ModalRoute
              path="levels"
              modal={LogLevelsModal}
              modalProps={{
                // EventSandbox interferes with mouse text selection in CodeMirror editor
                disableEventSandbox: true,
              }}
            />
          </Route>
        </Route>
      </Route>
    </Route>
  </Route>
);

export default getRoutes;
