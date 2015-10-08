import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

import cx from "classnames";

export default class OperatorSelector extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            expanded: false
        };
    }

    render() {
        let { field, filter } = this.props;
        let { expanded } = this.state;

        let operators = field.valid_operators;

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
                        key={operator.name}
                        className={cx("Button Button-normal Button--medium mr1 mb1", { "Button--purple": operator.name === filter[0] })}
                        onClick={() => this.props.onOperatorChange(operator.name)}
                    >
                        {operator.verboseName}
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
