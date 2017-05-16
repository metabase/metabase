/*
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE-EMBEDDING-PREMIUM.txt', which is part of this source code package.
 */
/* @flow weak */

import React from "react";

import { Route } from 'react-router';

import PublicNotFound from "metabase/public/components/PublicNotFound";

import PublicApp from "metabase/public/containers/PublicApp.jsx";
import PublicQuestion from "metabase/public/containers/PublicQuestion.jsx";
import PublicDashboard from "metabase/public/containers/PublicDashboard.jsx";

const PublicQuestionPremium = (props) => <PublicQuestion {...props} instanceIsPremium />
const PublicDashboardPremium = (props) => <PublicDashboard {...props} instanceIsPremium />

export const getRoutes = (store) =>
    <Route>
        <Route path="embed" component={PublicApp}>
            <Route path="question/:token" component={PublicQuestionPremium} />
            <Route path="dashboard/:token" component={PublicDashboardPremium} />
            <Route path="*" component={PublicNotFound} />
        </Route>
        <Route path="*" component={PublicNotFound} />
    </Route>
