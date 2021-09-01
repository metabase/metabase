/* eslint-disable react/prop-types */
import React from "react";
import fitViewport from "metabase/hoc/FitViewPort";
import Link from "metabase/components/Link";

import LogoIcon from "metabase/components/LogoIcon";

import Label from "metabase/components/type/Label";
import Subhead from "metabase/components/type/Subhead";

/*
    TODO - remove this in favor of explicit pages and imports until we can move to a static generator
*/

export const CATEGORIES = {
  layout: "Layout",
  input: "Input",
  display: "Data display",
  pickers: "Pickers",
  navigation: "Navigation",
  feedback: "Feedback",
  modal: "Modal",
  form: "Form",
  visualization: "Visualizations",
  search: "Search",
};

import COMPONENTS from "../lib/components-webpack";
import { slugify } from "metabase/lib/formatting";

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

/* TODO - this kind of stuff to populate the components should live in a "Container" as if it were redux state */
function getComponentName(component) {
  return (
    (component && (component.displayName || component.name)) || "[Unknown]"
  );
}
function getComponentSlug(component) {
  return slugify(getComponentName(component));
}

/* END_TODO */

/* TODO - refactor this to use styled components */
export const FixedPane = ({ children, width = 320 }) => (
  <div
    className="fixed left top bottom flex flex-column bg-white border-right"
    style={{ width }}
  >
    {children}
  </div>
);

const Header = () => (
  <Link
    className="link flex align-center border-bottom px4 py3"
    to="/_internal"
  >
    <LogoIcon />
    <Subhead ml={2} color="inherit">
      Styleguide
    </Subhead>
  </Link>
);

const IndentedList = ({ children }) => <ol className="ml2">{children}</ol>;

const ComponentItem = ({ component }) => {
  return (
    <li>
      <Link
        to={`/_internal/components/${getComponentSlug(component)}`}
        className="link"
      >
        <Label color="inherit">{getComponentName(component)}</Label>
      </Link>
    </li>
  );
};

export const InternalLayout = fitViewport(({ children }) => {
  return (
    <div>
      <FixedPane>
        <Header />
        <ul className="px4 py2 scroll-y">
          <li>
            <Link className="link" to={"/_internal/type"}>
              <Label>Type</Label>
            </Link>
          </li>
          <li>
            <Link className="link" to={"/_internal/icons"}>
              <Label>Icons</Label>
            </Link>
          </li>
          <li>
            <Link className="link" to={"/_internal/colors"}>
              <Label>Colors</Label>
            </Link>
          </li>
          <li className="my3">
            Components
            <IndentedList>
              {Object.keys(CATEGORIES).map(category => (
                <li key={category}>
                  <Label>{CATEGORIES[category]}</Label>
                  <IndentedList>
                    {COMPONENTS.filter(
                      c => c.category && c.category === category,
                    ).map(({ component }, index) => (
                      <ComponentItem key={index} component={component} />
                    ))}
                  </IndentedList>
                </li>
              ))}
              <li>
                <Label>Other</Label>
                <IndentedList>
                  {COMPONENTS.filter(c => !c.category).map(
                    ({ component }, index) => (
                      <ComponentItem key={index} component={component} />
                    ),
                  )}
                </IndentedList>
              </li>
            </IndentedList>
          </li>
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
