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
  layout: "layout",
  interaction: "interaction",
  inputs: "input",
  pickers: "pickers",
  navigation: "navigation",
};

import COMPONENTS from "../lib/components-webpack";
import { slugify } from "metabase/lib/formatting";

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
  <a
    className="text-brand flex align-center border-bottom px4 py3"
    href="/_internal"
  >
    <LogoIcon />
    <Subhead ml={2} color="inherit">
      Styleguide
    </Subhead>
  </a>
);

const IndentedList = ({ children }) => <ol className="ml2">{children}</ol>;

const ComponentItem = ({ component }) => {
  return (
    <li>
      <a
        className="py1 block link h3 text-bold"
        href={`/_internal/components/${getComponentSlug(component)}`}
      >
        <Label>{getComponentName(component)}</Label>
      </a>
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
              {Object.values(CATEGORIES).map(category => (
                <li>
                  <Label>{category}</Label>
                  <IndentedList>
                    {COMPONENTS.filter(
                      c => c.category && c.category === category,
                    ).map(({ component }) => (
                      <ComponentItem component={component} />
                    ))}
                  </IndentedList>
                </li>
              ))}
              <li>
                <Label>Other</Label>
                <IndentedList>
                  {COMPONENTS.filter(c => !c.category).map(({ component }) => (
                    <ComponentItem component={component} />
                  ))}
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
