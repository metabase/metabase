// ${object_name} routes

import React from "react";
import { Route } from "metabase/hoc/Title";
import { IndexRoute } from "react-router";

import ${ObjectName}List from "./containers/${ObjectName}List";
import ${ObjectName}Create from "./containers/${ObjectName}Create";
import ${ObjectName}Edit from "./containers/${ObjectName}Edit";

const getRoutes = (store) =>
    <Route title="${ObjectName}" path="${object_name}">
        <IndexRoute component={${ObjectName}List} />
        <Route path="create" component={${ObjectName}Create} />
        <Route path=":id" component={${ObjectName}Edit} />
    </Route>

export default getRoutes;
