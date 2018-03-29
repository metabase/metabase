/* @flow */

import React from "react";
import { Link, Route, IndexRoute } from "react-router";

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

const InternalLayout = ({ children }) => {
  return (
    <div className="flex flex-column full-height">
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
};

export default (
  <Route component={InternalLayout}>
    <IndexRoute component={WelcomeApp} />
    {Object.entries(PAGES).map(
      ([name, Component]) =>
        Component &&
        (Component.routes || (
          <Route path={name.toLowerCase()} component={Component} />
        )),
    )}
  </Route>
);
