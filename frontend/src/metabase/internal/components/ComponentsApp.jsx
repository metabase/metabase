import React, { Component } from "react";

import reactElementToJSXString from "react-element-to-jsx-string";
import components from "../lib/components-webpack";

const Section = ({ title, children }) =>
    <div className="mb2">
        <h3 className="my2">{title}</h3>
        {children}
    </div>

export default class ComponentsApp extends Component {
    render() {
        return (
            <div className="wrapper p4">
                {components.map(({ component, description, examples }) => (
                    <div>
                        <h2>{component.name}</h2>
                        { description &&
                            <p className="my2">{description}</p>
                        }
                        { component.propTypes &&
                            <Section title="Props">
                                {Object.keys(component.propTypes).map(prop =>
                                    <div>{prop}</div>
                                )}
                            </Section>
                        }
                        { examples &&
                            <Section title="Examples">
                                {Object.entries(examples).map(([name, element]) => (
                                    <div className="my2">
                                        <h4 className="my1">{name}</h4>
                                        <div className="flex flex-column">
                                            <div
                                                className="p2 bordered flex align-center flex-full"
                                            >
                                                <div>
                                                    {element}
                                                </div>
                                            </div>
                                            <div
                                                className="border-left border-right border-bottom text-code"
                                            >
                                                <div className="p1">
                                                    {reactElementToJSXString(element)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </Section>
                        }
                    </div>
                ))}
            </div>
        );
    }
}
