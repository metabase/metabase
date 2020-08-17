/* @flow weak */

import React from "react";

import { Route } from "metabase/hoc/Title";
import { t } from "ttag";

import PublicNotFound from "metabase/public/components/PublicNotFound";

import PublicApp from "metabase/public/containers/PublicApp";
import PublicQuestion from "metabase/public/containers/PublicQuestion";
import PublicDashboard from "metabase/public/containers/PublicDashboard";

export const getRoutes = store => (
  <Route title={t`Metabase`}>
    <Route path="public" component={PublicApp}>
      <Route path="question/:uuid" component={PublicQuestion} />
      <Route path="dashboard/:uuid" component={PublicDashboard} />
      <Route path="*" component={PublicNotFound} />
    </Route>
    <Route path="*" component={PublicNotFound} />
  </Route>
);
