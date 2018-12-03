import React from "react";
import { Route } from "metabase/hoc/Title";
import { IndexRoute, IndexRedirect } from "react-router";
import { t } from "c-3po";

import { withBackground } from "metabase/hoc/Background";
import { ModalRoute } from "metabase/hoc/ModalRoute";

// Settings
import SettingsEditorApp from "metabase/admin/settings/containers/SettingsEditorApp.jsx";

//  DB Add / list
import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp.jsx";
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp.jsx";

// Metadata / Data model
import MetadataEditorApp from "metabase/admin/datamodel/containers/MetadataEditorApp.jsx";
import MetricApp from "metabase/admin/datamodel/containers/MetricApp.jsx";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp.jsx";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp.jsx";
import AdminPeopleApp from "metabase/admin/people/containers/AdminPeopleApp.jsx";
import FieldApp from "metabase/admin/datamodel/containers/FieldApp.jsx";
import TableSettingsApp from "metabase/admin/datamodel/containers/TableSettingsApp.jsx";

import TasksApp from "metabase/admin/tasks/containers/TasksApp";
import TaskModal from "metabase/admin/tasks/containers/TaskModal";

// People
import PeopleListingApp from "metabase/admin/people/containers/PeopleListingApp.jsx";
import GroupsListingApp from "metabase/admin/people/containers/GroupsListingApp.jsx";
import GroupDetailApp from "metabase/admin/people/containers/GroupDetailApp.jsx";

import getAdminPermissionsRoutes from "metabase/admin/permissions/routes.jsx";

const getRoutes = (store, IsAdmin) => (
  <Route
    path="/admin"
    title={t`Admin`}
    component={withBackground("bg-white")(IsAdmin)}
  >
    <IndexRedirect to="/admin/settings" />

    <Route path="databases" title={t`Databases`}>
      <IndexRoute component={DatabaseListApp} />
      <Route path="create" component={DatabaseEditApp} />
      <Route path=":databaseId" component={DatabaseEditApp} />
    </Route>

    <Route path="datamodel" title={t`Data Model`}>
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
      <Route path="metric/create" component={MetricApp} />
      <Route path="metric/:id" component={MetricApp} />
      <Route path="segment/create" component={SegmentApp} />
      <Route path="segment/:id" component={SegmentApp} />
      <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
    </Route>

    {/* PEOPLE */}
    <Route path="people" title={t`People`} component={AdminPeopleApp}>
      <IndexRoute component={PeopleListingApp} />
      <Route path="groups" title={t`Groups`}>
        <IndexRoute component={GroupsListingApp} />
        <Route path=":groupId" component={GroupDetailApp} />
      </Route>
    </Route>

    {/* Troubleshooting */}
    <Route path="troubleshooting" title={t`Troubleshooting`}>
      <IndexRedirect to="tasks" />
      <Route path="tasks" component={TasksApp}>
        <ModalRoute path=":taskId" modal={TaskModal} />
      </Route>
    </Route>

    {/* SETTINGS */}
    <Route path="settings" title={t`Settings`}>
      <IndexRedirect to="/admin/settings/setup" />
      {/* <IndexRoute component={SettingsEditorApp} /> */}
      <Route path=":section/:authType" component={SettingsEditorApp} />
      <Route path=":section" component={SettingsEditorApp} />
    </Route>

    {getAdminPermissionsRoutes(store)}
  </Route>
);

export default getRoutes;
