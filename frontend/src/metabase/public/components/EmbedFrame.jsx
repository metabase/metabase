/* @flow */

import React, { Component } from "react";
import { withRouter } from "react-router"; import { IFRAMED } from "metabase/lib/dom";

import Parameters from "metabase/dashboard/containers/Parameters";
import LogoBadge from "./LogoBadge";

import querystring from "querystring";
import cx from "classnames";

import "./EmbedFrame.css";

const DEFAULT_OPTIONS = {
    bordered: IFRAMED,
    titled: true
}

import type { Parameter } from "metabase/meta/types/Dashboard";

type Props = {
    className?: string,
    children?: any,
    actionButtons?: any[],
    name?: string,
    description?: string,
    location: { query: {[key:string]: string}},
    parameters?: Parameter[],
    parameterValues?: {[key:string]: string},
    setParameterValue: (id: string, value: string) => void
}

@withRouter
export default class EmbedFrame extends Component<*, Props, *> {
    state = {
        innerScroll: true
    }

    componentWillMount() {
        if (window.iFrameResizer) {
            console.error("iFrameResizer resizer already defined.")
        } else {
            window.iFrameResizer = {
                autoResize: true,
                heightCalculationMethod: "bodyScroll",
                readyCallback: () => {
                    this.setState({ innerScroll: false })
                }
            }
            // $FlowFixMe: flow doesn't know about require.ensure
            require.ensure([], () => {
                require("iframe-resizer/js/iframeResizer.contentWindow.js")
            });
        }
    }

    _getOptions() {
        let options = querystring.parse(window.location.hash.replace(/^#/, ""));
        for (var name in options) {
            if (/^(true|false|-?\d+(\.\d+)?)$/.test(options[name])) {
                options[name] = JSON.parse(options[name]);
            }
        }
        return { ...DEFAULT_OPTIONS, ...options };
    }

    render() {
        const { className, children, actionButtons, location, parameters, parameterValues, setParameterValue } = this.props;
        const { innerScroll } = this.state;

        const footer = true;

        const { bordered, titled, theme } = this._getOptions();

        const name = titled ? this.props.name : null;

        return (
            <div className={cx("EmbedFrame flex flex-column", className, {
                "spread": innerScroll,
                "bordered rounded shadowed": bordered,
                [`Theme--${theme}`]: !!theme
            })}>
                <div className={cx("flex flex-column flex-full relative", { "scroll-y": innerScroll })}>
                    { name || (parameters && parameters.length > 0) ?
                        <div className="EmbedFrame-header flex align-center p1 sm-p2 lg-p3">
                            { name && (
                                <div className="h4 text-bold sm-h3 md-h2">{name}</div>
                            )}
                            { parameters && parameters.length > 0 ?
                                <div className="flex ml-auto">
                                    <Parameters
                                        parameters={parameters.map(p => ({ ...p, value: parameterValues && parameterValues[p.id] }))}
                                        query={location.query}
                                        setParameterValue={setParameterValue}
                                        syncQueryString
                                        isQB
                                    />
                                </div>
                            : null }
                        </div>
                    : null }
                    <div className="flex flex-column relative full flex-full">
                        {children}
                    </div>
                </div>
                { footer &&
                    <div className="EmbedFrame-footer p1 md-p2 lg-p3 border-top flex-no-shrink flex align-center">
                        <LogoBadge dark={theme} />
                        {actionButtons &&
                            <div className="flex-align-right text-grey-3">{actionButtons}</div>
                        }
                    </div>
                }
            </div>
        )
    }
}
