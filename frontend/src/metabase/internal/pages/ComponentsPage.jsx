/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { Link } from "react-router";

import { slugify } from "metabase/lib/formatting";

import COMPONENTS from "../lib/components-webpack";

import Heading from "metabase/components/type/Heading";
import Text from "metabase/components/type/Text";
import Subhead from "metabase/components/type/Subhead";

import Props from "metabase/internal/components/Props";
import Example from "metabase/internal/components/Example";

const Section = ({ title, children }) => (
  <div className="mb2">
    {title && <Subhead>{title}</Subhead>}
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
                className="mb4 pb3 px4"
              >
                <Heading>{getComponentName(component)}</Heading>
                {description && <Text>{description}</Text>}
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
                      .map(([name, element]) => (
                        <div key={name} className="my2">
                          <Subhead my={1}>
                            <Link
                              to={`_internal/components/${getComponentSlug(
                                component,
                              )}/${slugify(name)}`}
                              className="no-decoration"
                            >
                              {name}:
                            </Link>
                          </Subhead>
                          <Example>{element}</Example>
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
