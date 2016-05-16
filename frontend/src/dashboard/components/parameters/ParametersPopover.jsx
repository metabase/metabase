import React, { Component, PropTypes } from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import ParameterWidget from "./ParameterWidget.jsx";

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
              parameter = parameters && _.find(parameters, (p) => p.name === this.state.editParameter),
              name = _.isString(this.state.editParameter) ? this.state.editParameter : "";

        // TODO: at some point we need to prevent the add parameter button if there are none possible?
        // TODO: pass in names that aren't allowed to be used (to prevent dupes)
        return (
            <ParameterWidget
                parameter={parameter}
                onSetParameter={(newParameter) => {
                    this.props.onSetParameter(newParameter, name);
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

    render() {
        const { parameters } = this.props;

        let sortedParameters = _.sortBy(parameters, "name");
        return (
            <div>
                {!this.state.editParameter &&
                    <div style={{minWidth: "350px"}} className="p3">
                        <div className="pb1 h6 text-uppercase text-grey-3 text-bold">Parameters</div>

                        { sortedParameters && sortedParameters.map(param =>
                            <div key={param.name} className="pb1 text-brand text-bold cursor-pointer flex flex-row align-center justify-between" onClick={() => this.setState({editParameter: param.name})}>
                                <span>{param.name}</span>
                            </div>
                        )}

                        <a data-metabase-event={"QueryBuilder;Show Add Parameter"} className="text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color" onClick={() => this.setState({editParameter: true})}>
                            <IconBorder borderRadius="3px">
                                <Icon name="add" width="14px" height="14px" />
                            </IconBorder>
                            <span className="ml1">Add a parameter</span>
                        </a>
                    </div>
                }
                {this.renderParametersWidget()}
            </div>
        );
    }
}
