import React, { Component, PropTypes } from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import ParameterWidgetNative from "./ParameterWidgetNative.jsx";
import ParameterWidgetStructured from "./ParameterWidgetStructured.jsx";

import { formatExpression } from "metabase/lib/expressions";


export default class ParametersPopover extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            editParameter: null
        };
    }

    static propTypes = {
        parameters: PropTypes.array,
        tableMetadata: PropTypes.object,
        onSetParameter: PropTypes.func.isRequired,
        onRemoveParameter: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired
    };

    static defaultProps = {
        parameters: []
    };

    renderParametersWidget() {
        // if we aren't editing any parameter then there is nothing to do
        if (!this.state.editParameter) return null;

        const { parameters } = this.props,
              parameter = parameters && _.find(parameters, (p) => p.hash === this.state.editParameter);

        // TODO: at some point we need to prevent the add parameter button if there are none possible?
        // TODO: pass in names that aren't allowed to be used (to prevent dupes)
        if (this.props.tableMetadata) {
            return (
                <ParameterWidgetStructured
                    parameter={parameter}
                    tableMetadata={this.props.tableMetadata}
                    onSetParameter={(parameter) => {
                        this.props.onSetParameter(parameter);
                        this.props.onClose();
                    }}
                    onRemoveParameter={(parameter) => {
                        this.props.onRemoveParameter(parameter);
                        this.props.onClose();
                    }}
                    onCancel={() => this.setState({editParameter: null})}
                />
            );
        } else {
            return (
                <ParameterWidgetNative
                    parameter={parameter}
                    onSetParameter={(parameter) => {
                        this.props.onSetParameter(parameter);
                        this.props.onClose();
                    }}
                    onRemoveParameter={(parameter) => {
                        this.props.onRemoveParameter(parameter);
                        this.props.onClose();
                    }}
                    onCancel={() => this.setState({editParameter: null})}
                />
            );
        }
    }

    renderParametersList() {
        const { parameters } = this.props;
        let sortedParameters = _.sortBy(parameters, "name");

        if (sortedParameters && sortedParameters.length > 0) {
            return (
                <div className="border-bottom px2 pt2 pb1">
                    <div className="pb1 h6 text-uppercase text-grey-3 text-bold">Parameters</div>

                    { sortedParameters && sortedParameters.map(param =>
                        <div key={param.hash} className="pb1 text-bold cursor-pointer">
                            <span onClick={() => this.setState({editParameter: param.hash})}>{param.name}</span>
                            <span className="pl1 text-grey-3" title="Remove parameter" onClick={() => {this.props.onRemoveParameter(param); this.props.onClose();}}>
                                <Icon name="close" width="12px" height="12px"></Icon>
                            </span>
                        </div>
                    )}
                </div>
            );
        } else {
            return null;
        }

    }

    render() {
        return (
            <div style={{minWidth: 300}}>
                {!this.state.editParameter &&
                    <div>
                        {this.renderParametersList()}

                        <div className="p2">
                            <a data-metabase-event={"QueryBuilder;Show Add Parameter"} className="text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color" onClick={() => this.setState({editParameter: true})}>
                                <IconBorder borderRadius="3px">
                                    <Icon name="add" width="14px" height="14px" />
                                </IconBorder>
                                <span className="ml1">Add a parameter</span>
                            </a>
                        </div>
                    </div>
                }
                {this.renderParametersWidget()}
            </div>
        );
    }
}
