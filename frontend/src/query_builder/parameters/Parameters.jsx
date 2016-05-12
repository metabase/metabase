import React, { Component, PropTypes } from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import { formatExpression } from "metabase/lib/expressions";


export default class Parameters extends Component {

    static propTypes = {
        parameters: PropTypes.array,
        tableMetadata: PropTypes.object,
        onAddParameter: PropTypes.func.isRequired,
        onEditParameter: PropTypes.func.isRequired
    };

    static defaultProps = {
        parameters: []
    };

    render() {
        const { parameters, onAddParameter, onEditParameter } = this.props;

        let sortedParameters = _.sortBy(parameters, "name");
        return (
            <div className="pb3">
                <div className="pb1 h6 text-uppercase text-grey-3 text-bold">Parameters</div>

                { sortedParameters && sortedParameters.map(param =>
                    <div key={param.name} className="pb1 text-brand text-bold cursor-pointer flex flex-row align-center justify-between" onClick={() => onEditParameter(param.name)}>
                        <span>{param.name}</span>
                    </div>
                )}

                <a data-metabase-event={"QueryBuilder;Show Add Parameter"} className="text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color" onClick={() => onAddParameter()}>
                    <IconBorder borderRadius="3px">
                        <Icon name="add" width="14px" height="14px" />
                    </IconBorder>
                    <span className="ml1">Add a parameter</span>
                </a>
            </div>
        );
    }
}
