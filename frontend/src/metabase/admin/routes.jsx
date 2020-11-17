import React from "react";
import { Route } from "metabase/hoc/Title";
import { IndexRoute, IndexRedirect } from "react-router";
import { t } from "ttag";

import { PLUGIN_ADMIN_ROUTES } from "metabase/plugins";

import { withBackground } from "metabase/hoc/Background";
import { ModalRoute } from "metabase/hoc/ModalRoute";

import NewUserModal from "metabase/admin/people/containers/NewUserModal";
import UserSuccessModal from "metabase/admin/people/containers/UserSuccessModal";
import UserPasswordResetModal from "metabase/admin/people/containers/UserPasswordResetModal";
import EditUserModal from "metabase/admin/people/containers/EditUserModal";
import UserActivationModal from "metabase/admin/people/containers/UserActivationModal";

// Settings
import SettingsEditorApp from "metabase/admin/settings/containers/SettingsEditorApp";

//  DB Add / list
import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp";
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp";

// Metadata / Data model
import DataModelApp from "metabase/admin/datamodel/containers/DataModelApp";
import MetadataEditorApp from "metabase/admin/datamodel/containers/MetadataEditorApp";
import MetricListApp from "metabase/admin/datamodel/containers/MetricListApp";
import MetricApp from "metabase/admin/datamodel/containers/MetricApp";
import SegmentListApp from "metabase/admin/datamodel/containers/SegmentListApp";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import AdminPeopleApp from "metabase/admin/people/containers/AdminPeopleApp";
import FieldApp from "metabase/admin/datamodel/containers/FieldApp";
import TableSettingsApp from "metabase/admin/datamodel/containers/TableSettingsApp";

import TroubleshootingApp from "metabase/admin/tasks/containers/TroubleshootingApp";
import TasksApp from "metabase/admin/tasks/containers/TasksApp";
import TaskModal from "metabase/admin/tasks/containers/TaskModal";
import JobInfoApp from "metabase/admin/tasks/containers/JobInfoApp";
import JobTriggersModal from "metabase/admin/tasks/containers/JobTriggersModal";
import Logs from "metabase/admin/tasks/containers/Logs";
import Help from "metabase/admin/tasks/containers/Help";

// People
import PeopleListingApp from "metabase/admin/people/containers/PeopleListingApp";
import GroupsListingApp from "metabase/admin/people/containers/GroupsListingApp";
import GroupDetailApp from "metabase/admin/people/containers/GroupDetailApp";

// Permissions
import getAdminPermissionsRoutes from "metabase/admin/permissions/routes";

const getRoutes = (store, IsAdmin) => (
  <Route
    path="/admin"
    title={t`Admin`}
    component={withBackground("bg-white")(IsAdmin)}
  >
    <IndexRedirect to="settings" />

    <Route path="databases" title={t`Databases`}>
      <IndexRoute component={DatabaseListApp} />
      <Route path="create" component={DatabaseEditApp} />
      <Route path=":databaseId" component={DatabaseEditApp} />
    </Route>

    <Route path="datamodel" title={t`Data Model`} component={DataModelApp}>
      <IndexRedirect to="database" />
      <Route path="database" component={MetadataEditorApp} />
      <Route path="database/:databaseId" component={MetadataEditorApp} />
      <Route path="database/:databaseId/:mode" component={MetadataEditorApp} />
      <Route
        path="database/:databaseId/:mode/:tableId"
        component={MetadataEditorApp}
      />
      <Route
        path="database/:databaseId/:mode/:tableId/settings"
        component={TableSettingsApp}
      />
      <Route path="database/:databaseId/:mode/:tableId/:fieldId">
        <IndexRedirect to="general" />
        <Route path=":section" component={FieldApp} />
      </Route>
      <Route path="metrics" component={MetricListApp} />
      <Route path="metric/create" component={MetricApp} />
      <Route path="metric/:id" component={MetricApp} />
      <Route path="segments" component={SegmentListApp} />
      <Route path="segment/create" component={SegmentApp} />
      <Route path="segment/:id" component={SegmentApp} />
      <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
    </Route>

    {/* PEOPLE */}
    <Route path="people" title={t`People`} component={AdminPeopleApp}>
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
        <ModalRoute path="edit" modal={EditUserModal} />
        <ModalRoute path="success" modal={UserSuccessModal} />
        <ModalRoute path="reset" modal={UserPasswordResetModal} />
        <ModalRoute path="deactivate" modal={UserActivationModal} />
        <ModalRoute path="reactivate" modal={UserActivationModal} />
      </Route>
    </Route>

    {/* Troubleshooting */}
    <Route
      path="troubleshooting"
      title={t`Troubleshooting`}
      component={TroubleshootingApp}
    >
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

    {/* SETTINGS */}
    <Route path="settings" title={t`Settings`}>
      <IndexRedirect to="setup" />
      <Route path="*" component={SettingsEditorApp} />
    </Route>

    {/* PERMISSIONS */}
    {getAdminPermissionsRoutes(store)}

    {/* PLUGINS */}
    {PLUGIN_ADMIN_ROUTES.map(getRoutes => getRoutes(store))}
  </Route>
);

export default getRoutes;
