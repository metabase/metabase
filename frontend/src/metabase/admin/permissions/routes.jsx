/* eslint-disable react/prop-types */
import React from "react";
import { Route } from "metabase/hoc/Title";
import { IndexRedirect, IndexRoute } from "react-router";
import { t } from "ttag";
import CollectionPermissionsPage from "./pages/CollectionPermissionsPage";
import DatabasesPermissionsPage from "./pages/DatabasesPermissionsPage";
import GroupsPermissionsPage from "./pages/GroupsPermissionsPage";

import { PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES } from "metabase/plugins";

const getRoutes = () => (
  <Route title={t`Permissions`} path="permissions">
    {/* DATABASES */}
    <Route path="data">
      <IndexRedirect to="groups" />

      <Route path="groups" component={GroupsPermissionsPage}>
        <Route path=":groupId" component={GroupsPermissionsPage} />
      </Route>
      <Route path="databases" component={DatabasesPermissionsPage}>
        <Route path=":databaseId" component={DatabasesPermissionsPage} />
      </Route>
    </Route>

    <Route path="collections" component={CollectionPermissionsPage}>
      <Route path=":collectionId" component={CollectionPermissionsPage} />
    </Route>
  </Route>
);

export default getRoutes;
