/* @flow weak */

import React, { Component, PropTypes } from "react";

import { Route } from 'react-router';

import PublicNotFound from "metabase/public/components/PublicNotFound";

import PublicApp from "metabase/public/containers/PublicApp.jsx";
import PublicQuestion from "metabase/public/containers/PublicQuestion.jsx";
import PublicDashboard from "metabase/public/containers/PublicDashboard.jsx";

export const getRoutes = (store) =>
    <Route>
        <Route path="public" component={PublicApp}>
            <Route path="question/:uuid" component={PublicQuestion} />
            <Route path="dashboard/:uuid" component={PublicDashboard} />
            <Route path="*" component={PublicNotFound} />
        </Route>
        <Route path="embed" component={PublicApp}>
            <Route path="question/:token" component={PublicQuestion} />
            <Route path="dashboard/:token" component={PublicDashboard} />
            <Route path="*" component={PublicNotFound} />
        </Route>
        <Route path="*" component={PublicNotFound} />
    </Route>
