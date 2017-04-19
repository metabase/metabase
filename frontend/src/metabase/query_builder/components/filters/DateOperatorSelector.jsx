/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";

import cx from "classnames";
import { titleCase } from "humanize-plus";

import Icon from "metabase/components/Icon";

type Operator = {
    name: string
}

type Props = {
    operator: string,
    operators: Operator[],
    onOperatorChange: (o: Operator) => void,
    hideTimeSelectors?: bool
}

type State = {
    expanded: bool
};

export default class DateOperatorSelector extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor() {
        super();
        this.state = {
            expanded: false
        };
    }

    static propTypes = {
        operator: PropTypes.string,
        operators: PropTypes.array.isRequired,
        onOperatorChange: PropTypes.func.isRequired
    };

    toggleExpanded = () => {
        this.setState({ expanded: !this.state.expanded });
    }

    render() {
        const { operator, operators, onOperatorChange } = this.props;
        const { expanded } = this.state;

        return (
            <div className="mx2">
                <div
                    className="flex align-center cursor-pointer text-purple-hover mb2"
                    onClick={() => this.toggleExpanded()}
                >
                    <h3>{operator && titleCase(operator)}</h3>
                    <Icon
                        name={expanded ? 'chevronup' : 'chevrondown'}
                        width="12"
                        height="12"
                        className="ml1"
                    />
                </div>
                <ul
                    className="text-purple"
                    style={{
                        height: expanded ? 'auto' : 0,
                        overflow: 'hidden',
                        display: 'block',
                    }}
                >
                    { operators.map(o =>
                        <li
                            className={cx('List-item cursor-pointer p1', {
                                'List-item--selected': o.name === operator
                            })}
                            key={o.name}
                            onClick={() => {
                                onOperatorChange(o);
                                this.toggleExpanded();
                            }}
                        >
                            <h4 className="List-item-title">{o.name}</h4>
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}
