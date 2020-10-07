/* @flow */

import React from "react";
import { Link, Route, IndexRedirect } from "react-router";

import {
  Archived,
  GenericError,
  NotFound,
  Unauthorized,
} from "metabase/containers/ErrorPages";

/* Pages - In order they appear in nav */
import TypePage from "metabase/internal/pages/TypePage";
import IconsPage from "metabase/internal/pages/IconsPage";
import ColorsPage from "metabase/internal/pages/ColorsPage";
import ModalsPage from "metabase/internal/pages/ModalsPage";

import { slugify } from "metabase/lib/formatting";

import LogoIcon from "metabase/components/LogoIcon";

import fitViewport from "metabase/hoc/FitViewPort";
import COMPONENTS from "./lib/components-webpack";

function getComponentName(component) {
  return (
    (component && (component.displayName || component.name)) || "[Unknown]"
  );
}
function getComponentSlug(component) {
  return slugify(getComponentName(component));
}

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

/* TODO - refactor this to use styled components */
const FixedPane = ({ children, width = 320 }) => (
  <div
    className="fixed left top bottom flex flex-column overflow-y bg-white border-right p4"
    style={{ width }}
  >
    {children}
  </div>
);

const Header = ({ children }) => (
  <nav className="bg-white border-bottom">{children}</nav>
);

const WelcomeApp = () => {
  return (
    <div className="wrapper">
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
    <div>
      <FixedPane>
        <a className="text-brand-hover" href="/_internal">
          <LogoIcon />
          <h4>Style Guide</h4>
        </a>
        <ul>
          <li>
            <Link className="link" to={"/_internal/type"}>
              Type
            </Link>
          </li>
          <li>
            <Link className="link" to={"/_internal/icons"}>
              Icons
            </Link>
          </li>
          <li>
            <Link className="link" to={"/_internal/colors"}>
              Colors
            </Link>
          </li>
          <li className="my3">Components</li>
          {COMPONENTS.map(({ component, description, examples }) => (
            <li>
              <a
                className="py1 block link h3 text-bold"
                href={`/_internal/components/${getComponentSlug(component)}`}
              >
                {getComponentName(component)}
              </a>
            </li>
          ))}
          {Object.keys(PAGES).map(name => (
            <li key={name}>
              <Link className="link" to={"/_internal/" + name.toLowerCase()}>
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </FixedPane>
      <div style={{ marginLeft: 320 }}>
        <div className="wrapper">{children}</div>
      </div>
    </div>
  );
});

export default (
  <Route component={InternalLayout}>
    <IndexRedirect to="welcome" />
    <Route path="welcome" component={WelcomeApp} />
    <Route path="type" component={TypePage} />
    <Route path="icons" component={IconsPage} />
    <Route path="colors" component={ColorsPage} />
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
