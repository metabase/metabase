/* @flow */

import React, { Component } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import cx from "classnames";
import _ from "underscore";

import {forceRedraw} from "metabase/lib/dom";

import Icon from "metabase/components/Icon.jsx";

import type { Operator, OperatorName } from "metabase/meta/types/Metadata"

type Props = {
    operator: string,
    operators: Operator[],
    onOperatorChange: (name: OperatorName) => void
};

type State = {
    expanded: bool
};

export default class OperatorSelector extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);
        // if the initial operator is "advanced" expand the list
        let operator = _.find(props.operators, o => o.name === props.operator);
        this.state = {
            expanded: !!(operator && operator.advanced)
        };
    }

    static propTypes = {
        operator: PropTypes.string,
        operators: PropTypes.array.isRequired,
        onOperatorChange: PropTypes.func.isRequired
    };

    expandOperators = () => {
        this.setState({ expanded: true }, () => {
            // HACK: Address Safari rendering bug which causes https://github.com/metabase/metabase/issues/5075
            forceRedraw(ReactDOM.findDOMNode(this));
        });
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
            <div id="OperatorSelector" className="border-bottom p1" style={{
                maxWidth: 300
            }}>
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
                    <div className="text-grey-3 cursor-pointer" onClick={this.expandOperators}>
                        <Icon className="px1" name="chevrondown" size={14} />
                        More Options
                    </div>
                : null }
            </div>
        );
    }
}
