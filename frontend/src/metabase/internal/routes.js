import React from "react";
import { Route, IndexRedirect } from "react-router";

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
import ColorsPage from "metabase/internal/pages/ColorsPage";
import ComponentsPage from "metabase/internal/pages/ComponentsPage";
import ModalsPage from "metabase/internal/pages/ModalsPage";

import { InternalLayout } from "metabase/internal/components/Layout";

const ErrorWithDetails = () => <GenericError details="Example error message" />;

export default (
  <Route component={InternalLayout}>
    <IndexRedirect to="welcome" />
    <Route path="welcome" component={WelcomePage} />
    <Route path="type" component={TypePage} />
    <Route path="icons" component={IconsPage} />
    <Route path="colors" component={ColorsPage} />
    <Route path="components/:componentName" component={ComponentsPage} />
    <Route path="modals" component={ModalsPage} />
    {/* Legacy App pages - not really style guide related, but keep for now */}
    {Object.entries(APPS).map(
      ([name, Component]) =>
        Component &&
        (Component.routes || (
          <Route path={name.toLowerCase()} component={Component} />
        )),
    )}
    <Route path="errors">
      <Route path="404" component={NotFound} />
      <Route path="archived" component={Archived} />
      <Route path="unauthorized" component={Unauthorized} />
      <Route path="generic" component={GenericError} />
      <Route path="details" component={ErrorWithDetails} />
    </Route>
  </Route>
);
