import React from "react";
import { Route, IndexRoute } from "react-router";

import IconsApp from "metabase/internal/components/IconsApp";
import ColorsApp from "metabase/internal/components/ColorsApp";
import ComponentsApp from "metabase/internal/components/ComponentsApp";

const PAGES = {
  Icons: IconsApp,
  Colors: ColorsApp,
  Components: ComponentsApp,
};

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
              <a className="link mx2" href={"/_internal/" + name.toLowerCase()}>
                {name}
              </a>
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
    {Object.entries(PAGES).map(([name, Component]) => (
      <Route path={name.toLowerCase()} component={Component} />
    ))}
    <Route path="components/:componentName" component={ComponentsApp} />
    <Route
      path="components/:componentName/:exampleName"
      component={ComponentsApp}
    />
  </Route>
);
