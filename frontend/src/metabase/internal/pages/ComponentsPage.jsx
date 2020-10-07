/* @flow */

import React, { Component } from "react";
import { Link, Route } from "react-router";

import { slugify } from "metabase/lib/formatting";

import COMPONENTS from "../lib/components-webpack";

import Props from "metabase/internal/components/Props";
import Example from "metabase/internal/components/Example";

const Section = ({ title, children }) => (
  <div className="mb2">
    {title && <h3 className="my2">{title}</h3>}
    {children}
  </div>
);

function getComponentName(component) {
  return (
    (component && (component.displayName || component.name)) || "[Unknown]"
  );
}
function getComponentSlug(component) {
  return slugify(getComponentName(component));
}

export default class ComponentsPage extends Component {
  static routes: ?[React$Element<Route>];
  render() {
    const componentName = slugify(this.props.params.componentName);
    const exampleName = slugify(this.props.params.exampleName);
    return (
      <div className="wrapper wrapper--trim">
        <div>
          <div className="py4">
            {COMPONENTS.filter(
              ({ component, description, examples }) =>
                !componentName || componentName === getComponentSlug(component),
            ).map(({ component, description, examples }, index) => (
              <div
                id={getComponentSlug(component)}
                key={index}
                className="border-bottom mb4 pb3 px4"
              >
                <h2>
                  <Link
                    to={`_internal/components/${getComponentSlug(component)}`}
                    className="no-decoration"
                  >
                    {getComponentName(component)}
                  </Link>
                </h2>
                {description && <p className="my2">{description}</p>}
                {componentName === getComponentSlug(component) &&
                  component.propTypes && (
                    <Section title="Props">
                      <Props of={component} />
                    </Section>
                  )}
                {examples && (
                  <Section>
                    {Object.entries(examples)
                      .filter(
                        ([name, element]) =>
                          !exampleName || exampleName === slugify(name),
                      )
                      .map(([name, element]) => {
                        console.log("element", element);
                        return (
                          <div className="my2">
                            <h4 className="my1">
                              <Link
                                to={`_internal/components/${getComponentSlug(
                                  component,
                                )}/${slugify(name)}`}
                                className="no-decoration"
                              >
                                {name}:
                              </Link>
                            </h4>
                            <Example>{element}</Example>
                          </div>
                        );
                      })}
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
