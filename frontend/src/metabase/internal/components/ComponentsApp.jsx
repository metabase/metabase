/* @flow */

import React, { Component } from "react";
import { Link, Route } from "react-router";

import { slugify } from "metabase/lib/formatting";
import cx from "classnames";

// $FlowFixMe: react-virtualized ignored
import reactElementToJSXString from "react-element-to-jsx-string";
import prettier from "prettier/standalone";
import prettierParserBabylon from "prettier/parser-babylon";

import COMPONENTS from "../lib/components-webpack";

import AceEditor from "metabase/components/TextEditor";
import CopyButton from "metabase/components/CopyButton";
import Icon from "metabase/components/Icon";

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
                component &&
                (!componentName ||
                  componentName === getComponentSlug(component)),
            ).map(({ component, description, examples }) => (
              <li>
                <a
                  className="py1 block link h3 text-bold"
                  href={`/_internal/components#${getComponentSlug(component)}`}
                >
                  {getComponentName(component)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="bg-light flex-full bg-white" style={{ flex: "66.66%" }}>
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
                  <Section>
                    {Object.entries(examples)
                      .filter(
                        ([name, element]) =>
                          !exampleName || exampleName === slugify(name),
                      )
                      .map(([name, element]) => (
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
                          <div className="flex flex-column">
                            <div className="p2 bordered rounded flex align-center flex-full">
                              <div className="full">{element}</div>
                            </div>
                            <SourcePane element={element} />
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

class SourcePane extends React.Component {
  state = {
    isOpen: false,
  };
  render() {
    const { element } = this.props;
    const { isOpen } = this.state;
    let source = reactElementToJSXString(element, {
      showFunctions: true,
      showDefaultProps: false,
    });
    try {
      source = prettier.format(source, {
        parser: "babel",
        plugins: [prettierParserBabylon],
      });
    } catch (e) {
      console.log(e);
    }

    const scratchUrl = "/_internal/scratch#" + btoa(source);
    return (
      <div
        className={cx("relative", {
          "border-left border-right border-bottom": isOpen,
        })}
      >
        {isOpen && (
          <AceEditor
            value={source}
            mode="ace/mode/jsx"
            theme="ace/theme/metabase"
            readOnly
          />
        )}
        {isOpen ? (
          <div className="absolute top right z2 flex align-center p1 text-medium">
            <CopyButton
              className="ml1 text-brand-hover cursor-pointer"
              value={source}
            />
            <Link to={scratchUrl}>
              <Icon
                name="pencil"
                className="ml1 text-brand-hover cursor-pointer"
              />
            </Link>
            <Icon
              name="close"
              className="ml1 text-brand-hover cursor-pointer"
              onClick={() => this.setState({ isOpen: false })}
            />
          </div>
        ) : (
          <div className="p1 flex align-ceneter justify-end">
            <Link className="link ml1" to={scratchUrl}>
              Open in Scratch
            </Link>
            <span
              className="link ml1"
              onClick={() => this.setState({ isOpen: true })}
            >
              View Source
            </span>
          </div>
        )}
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
