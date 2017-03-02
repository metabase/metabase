/* @flow */

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { withRouter } from "react-router";

import { IFRAMED } from "metabase/lib/dom";

import Parameters from "metabase/dashboard/containers/Parameters";
import LogoBadge from "./LogoBadge";

import querystring from "querystring";
import cx from "classnames";

const DEFAULT_OPTIONS = {
    bordered: IFRAMED
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
        const { className, children, actionButtons, name, location, parameters, parameterValues, setParameterValue } = this.props;
        const footer = true;

        return (
            <div className={cx("flex flex-column bg-white", className)}>
                <div className="flex flex-column flex-full scroll-y relative">
                    <div className="flex align-center px1 pt1 pb0 sm-px2 sm-pt2 sm-pb0 lg-px3 lg-pt3 lg-pb1 bg-white">
                        { name && (
                            <div className="h4 text-bold sm-h3 md-h2 text-dark">{name}</div>
                        )}
                        { parameters && parameters.length > 0 ?
                            <div className="flex ml-auto">
                                <Parameters
                                    parameters={parameters.map(p => ({ ...p, value: parameterValues && parameterValues[p.id] }))}
                                    query={location.query}
                                    setParameterValue={setParameterValue}
                                    isQB
                                />
                            </div>
                        : null }
                    </div>
                    <div className="flex flex-column relative full flex-full px1">
                        {children}
                    </div>
                </div>
                { footer &&
                    <div className="p1 md-p2 lg-p3 bg-white border-top flex-no-shrink flex align-center">
                        <LogoBadge logoClassName="sm-show" />
                        {actionButtons &&
                            <div className="flex-align-right text-grey-3">{actionButtons}</div>
                        }
                    </div>
                }
            </div>
        )
    }
}
