
import React from "react";
import { Route } from "metabase/hoc/Title";
import { IndexRedirect } from 'react-router';

import DataPermissionsApp from "./containers/DataPermissionsApp.jsx";
import DatabasesPermissionsApp from "./containers/DatabasesPermissionsApp.jsx";
import SchemasPermissionsApp from "./containers/SchemasPermissionsApp.jsx";
import TablesPermissionsApp from "./containers/TablesPermissionsApp.jsx";

const getRoutes = (store) =>
    <Route title="Permissions" path="permissions" component={DataPermissionsApp}>
        <IndexRedirect to="databases" />
        <Route path="databases" component={DatabasesPermissionsApp} />
        <Route path="databases/:databaseId/schemas" component={SchemasPermissionsApp} />
        <Route path="databases/:databaseId/schemas/:schemaName/tables" component={TablesPermissionsApp} />

        {/* NOTE: this route is to support null schemas, inject the empty string as the schemaName */}
        <Route path="databases/:databaseId/tables" component={(props) => // eslint-disable-line react/display-name
            <TablesPermissionsApp {...props} params={{ ...props.params, schemaName: "" }} />
        }/>
    </Route>

export default getRoutes;
