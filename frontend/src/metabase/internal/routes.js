import React, { Fragment } from "react";
import { Route, IndexRedirect } from "react-router";

import { isProduction } from "metabase/env";

import {
  Archived,
  GenericError,
  NotFound,
  Unauthorized,
} from "metabase/containers/ErrorPages";

// Import legacy apps - TODO - move this to a different style of documentation
const req = require.context(
  "metabase/internal/components",
  true,
  /(\w+)App.jsx$/,
);

const APPS = {};
for (const key of req.keys()) {
  const name = key.match(/(\w+)App.jsx$/)[1];
  APPS[name] = req(key).default;
}

/* Pages - In order they appear in nav */
import WelcomePage from "metabase/internal/pages/WelcomePage";
import TypePage from "metabase/internal/pages/TypePage";
import IconsPage from "metabase/internal/pages/IconsPage";
import ComponentsPage from "metabase/internal/pages/ComponentsPage";
import ModalsPage from "metabase/internal/pages/ModalsPage";
import StaticVizPage from "metabase/internal/pages/StaticVizPage";

import { InternalLayout } from "metabase/internal/components/Layout";

const ErrorWithDetails = () => <GenericError details="Example error message" />;

export default (
  <>
    {!isProduction && (
      <Route component={InternalLayout}>
        <IndexRedirect to="welcome" />
        <Route path="welcome" component={WelcomePage} />
        <Route path="type" component={TypePage} />
        <Route path="icons" component={IconsPage} />
        <Route path="components/:componentName" component={ComponentsPage} />
        <Route path="modals" component={ModalsPage} />
        <Route path="static-viz" component={StaticVizPage} />
        {/* Legacy App pages - not really style guide related, but keep for now */}
        {Object.entries(APPS).map(
          ([name, Component], routeIndex) =>
            Component && (
              <Fragment key={routeIndex}>
                {Component.routes || (
                  <Route path={name.toLowerCase()} component={Component} />
                )}
              </Fragment>
            ),
        )}
        <Route path="errors">
          <Route path="404" component={NotFound} />
          <Route path="archived" component={Archived} />
          <Route path="unauthorized" component={Unauthorized} />
          <Route path="generic" component={GenericError} />
          <Route path="details" component={ErrorWithDetails} />
        </Route>
      </Route>
    )}
  </>
);
