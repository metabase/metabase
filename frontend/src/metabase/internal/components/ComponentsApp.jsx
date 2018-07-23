/* @flow */

import React, { Component } from "react";
import { Link, Route } from "react-router";

import { slugify } from "metabase/lib/formatting";

// $FlowFixMe: react-virtualized ignored
import reactElementToJSXString from "react-element-to-jsx-string";

import COMPONENTS from "../lib/components-webpack";

import AceEditor from "metabase/components/TextEditor";
import CopyButton from "metabase/components/CopyButton";

const Section = ({ title, children }) => (
  <div className="mb2">
    <h3 className="my2">{title}</h3>
    {children}
  </div>
);

export default class ComponentsApp extends Component {
  static routes: ?[React$Element<Route>];
  render() {
    const componentName = slugify(this.props.params.componentName);
    const exampleName = slugify(this.props.params.exampleName);
    return (
      <div className="flex full">
        <nav
          className="full-height border-right p2 pl4"
          style={{ flex: "0 0 33.33%" }}
        >
          <h2 className="my2">Components</h2>
          <ul className="py2">
            {COMPONENTS.filter(
              ({ component, description, examples }) =>
                !componentName || componentName === slugify(component.name),
            ).map(({ component, description, examples }) => (
              <li>
                <a
                  className="py1 block link h3 text-bold"
                  href={`/_internal/components#${component.name}`}
                >
                  {component.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="bg-light flex-full bg-white" style={{ flex: "66.66%" }}>
          <div className="p4">
            {COMPONENTS.filter(
              ({ component, description, examples }) =>
                !componentName || componentName === slugify(component.name),
            ).map(({ component, description, examples }, index) => (
              <div id={component.name} key={index}>
                <h2>
                  <Link
                    to={`_internal/components/${slugify(component.name)}`}
                    className="no-decoration"
                  >
                    {component.name}
                  </Link>
                </h2>
                {description && <p className="my2">{description}</p>}
                {component.propTypes && (
                  <Section title="Props">
                    <div className="border-left border-right border-bottom text-code">
                      {Object.keys(component.propTypes).map(prop => (
                        <div>
                          {prop}{" "}
                          {component.defaultProps &&
                          component.defaultProps[prop] !== undefined
                            ? "(default: " +
                              JSON.stringify(component.defaultProps[prop]) +
                              ")"
                            : ""}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
                {examples && (
                  <Section title="Examples">
                    {Object.entries(examples)
                      .filter(
                        ([name, element]) =>
                          !exampleName || exampleName === slugify(name),
                      )
                      .map(([name, element]) => (
                        <div className="my2">
                          <h4 className="my1">
                            <Link
                              to={`_internal/components/${slugify(
                                component.name,
                              )}/${slugify(name)}`}
                              className="no-decoration"
                            >
                              {name}
                            </Link>
                          </h4>
                          <div className="flex flex-column">
                            <div className="p2 bordered flex align-center flex-full">
                              <div className="full">{element}</div>
                            </div>
                            <div className="relative">
                              <AceEditor
                                value={reactElementToJSXString(element)}
                                mode="ace/mode/jsx"
                                theme="ace/theme/metabase"
                                readOnly
                              />
                              <div className="absolute top right text-brand-hover cursor-pointer z2">
                                <CopyButton
                                  className="p1"
                                  value={reactElementToJSXString(element)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </Section>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

ComponentsApp.routes = [
  <Route path="components" component={ComponentsApp} />,
  <Route path="components/:componentName" component={ComponentsApp} />,
  <Route
    path="components/:componentName/:exampleName"
    component={ComponentsApp}
  />,
];
