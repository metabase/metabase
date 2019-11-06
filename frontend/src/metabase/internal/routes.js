/* @flow */

import React from "react";
import { Link, Route, IndexRedirect } from "react-router";

import {
  Archived,
  GenericError,
  NotFound,
  Unauthorized,
} from "metabase/containers/ErrorPages";

import ModalsPage from "./pages/ModalsPage";

import fitViewport from "metabase/hoc/FitViewPort";

const ErrorWithDetails = () => <GenericError details="Example error message" />;

// $FlowFixMe: doesn't know about require.context
const req = require.context(
  "metabase/internal/components",
  true,
  /(\w+)App.jsx$/,
);

const PAGES = {};
for (const key of req.keys()) {
  const name = key.match(/(\w+)App.jsx$/)[1];
  PAGES[name] = req(key).default;
}

const WelcomeApp = () => {
  return (
    <div className="wrapper flex flex-column justify-center">
      <div className="my4">
        <h1>Metabase Style Guide</h1>
        <p className="text-paragraph">
          Reference and samples for how to make things the Metabase way.
        </p>
      </div>
    </div>
  );
};

const InternalLayout = fitViewport(({ children }) => {
  return (
    <div className="flex flex-column flex-full">
      <nav className="wrapper flex align-center py3 border-bottom">
        <a className="text-brand-hover" href="/_internal">
          <h4>Style Guide</h4>
        </a>
        <ul className="flex ml-auto">
          {Object.keys(PAGES).map(name => (
            <li key={name}>
              <Link
                className="link mx2"
                to={"/_internal/" + name.toLowerCase()}
              >
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-full">{children}</div>
    </div>
  );
});

export default (
  <Route component={InternalLayout}>
    <IndexRedirect to="welcome" />
    <Route path="welcome" component={WelcomeApp} />
    {Object.entries(PAGES).map(
      ([name, Component]) =>
        Component &&
        (Component.routes || (
          <Route path={name.toLowerCase()} component={Component} />
        )),
    )}
    <Route path="modals" component={ModalsPage} />
    <Route path="errors">
      <Route path="404" component={NotFound} />
      <Route path="archived" component={Archived} />
      <Route path="unauthorized" component={Unauthorized} />
      <Route path="generic" component={GenericError} />
      <Route path="details" component={ErrorWithDetails} />
    </Route>
  </Route>
);
