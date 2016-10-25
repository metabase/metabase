import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";
import _ from "underscore";

export default class OperatorSelector extends Component {
    constructor(props, context) {
        super(props, context);
        // if the initial operator is "advanced" expand the list
        let operator = _.find(props.operators, o => o.name === props.operator);
        this.state = {
            expanded: operator && operator.advanced
        };
    }

    static propTypes = {
        operator: PropTypes.string,
        operators: PropTypes.array.isRequired,
        onOperatorChange: PropTypes.func.isRequired
    };

    render() {
        let { operator, operators } = this.props;
        let { expanded } = this.state;

        let defaultOperators = operators.filter(o => !o.advanced);
        let expandedOperators = operators.filter(o => o.advanced);

        let visibleOperators = defaultOperators;
        if (expanded) {
            visibleOperators = visibleOperators.concat(expandedOperators);
        }

        return (
            <div id="OperatorSelector" className="border-bottom p1">
                { visibleOperators.map(o =>
                    <button
                        key={o.name}
                        className={cx("Button Button-normal Button--medium mr1 mb1", { "Button--purple": o.name === operator })}
                        onClick={() => this.props.onOperatorChange(o.name)}
                    >
                        {o.verboseName}
                    </button>
                )}
                { !expanded && expandedOperators.length > 0 ?
                    <div className="text-grey-3 cursor-pointer" onClick={() => this.setState({ expanded: true })}>
                        <Icon className="px1" name="chevrondown" size={14} />
                        More Options
                    </div>
                : null }
            </div>
        );
    }
}
