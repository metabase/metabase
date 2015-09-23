"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

import { getUmbrellaType, NUMBER, STRING, TIME } from "metabase/lib/schema_metadata";

import cx from "classnames";

// TODO: merge into schema_metadata?
const OPERATORS = {
    [NUMBER]: [
        { name: "=",       verbose_name: "Equal" },
        { name: "!=",      verbose_name: "Not equal" },
        { name: ">",       verbose_name: "Greater than" },
        { name: "<",       verbose_name: "Less than" },
        { name: "BETWEEN", verbose_name: "Between" },
        { name: ">=",      verbose_name: "Greater than or equal to", advanced: true },
        { name: "<=",      verbose_name: "Less than or equal to", advanced: true }
    ],
    [STRING]: [
        { name: "=",       verbose_name: "Is" },
        { name: "!=",      verbose_name: "Is not" }
    ],
    [TIME]: [
        { name: "=",       verbose_name: "Is" },
        { name: "<",       verbose_name: "Before" },
        { name: ">",       verbose_name: "After" },
        { name: "BETWEEN", verbose_name: "Between" }
    ]
};

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

        let operators = field.valid_operators;

        // use overide order/name/visibility
        let type = getUmbrellaType(field);
        if (type in OPERATORS) {
            operators = OPERATORS[type].map(o => ({ ...field.operators_lookup[o.name], ...o }))
        }

        let defaultOperators = operators.filter(o => !o.advanced);
        let expandedOperators = operators.filter(o => o.advanced);

        let visibleOperators = defaultOperators;
        if (expanded) {
            visibleOperators = visibleOperators.concat(expandedOperators);
        }

        return (
            <div className="border-bottom p1">
                { visibleOperators.map(operator =>
                    <button
                        style={{padding: '0.5rem 1rem', fontSize: '0.8rem'}}
                        className={cx("Button Button--small mr1 mb1", { "Button--purple": operator.name === filter[0] })}
                        onClick={() => this.props.onOperatorChange(operator.name)}
                    >
                        {operator.verbose_name}
                    </button>
                )}
                { !expanded && expandedOperators.length > 0 ?
                    <div className="text-grey-3 cursor-pointer" onClick={() => this.setState({ expanded: true })}>
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
    onOperatorChange: PropTypes.func.isRequired
};
