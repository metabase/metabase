"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

import cx from "classnames";

export default class OperatorSelector extends Component {
    constructor(props) {
        super(props);
        this.state = {
            expanded: false
        };
    }

    render() {
        let { field, filter } = this.props;
        let { expanded } = this.state;

        var operators = expanded ?
            field.valid_operators :
            field.valid_operators.slice(0, 5);

        return (
            <div className="border-bottom p1">
                { operators.map(operator =>
                    <button className={cx("Button Button--small mr1", { "Button--purple": operator.name === filter[0] })} onClick={() => this.props.setOperator(operator.name)}>
                        {operator.verbose_name}
                    </button>
                )}
                { !expanded && field.valid_operators.length > 5 ?
                    <div className="text-grey-3 cursor-pointer pt2" onClick={() => this.setState({ expanded: true })}>
                        <Icon className="px1" name="chevrondown" width="14" height="14" />
                        More Options
                    </div>
                : null }
            </div>
        );
    }
}

OperatorSelector.propTypes = {
    filter: PropTypes.array.isRequired,
    field: PropTypes.object.isRequired,
    setOperator: PropTypes.func.isRequired
};
