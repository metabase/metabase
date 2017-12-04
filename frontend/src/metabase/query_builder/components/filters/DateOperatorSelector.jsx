/* @flow */

import React, { Component } from "react";

import cx from "classnames";
import { titleCase } from "humanize-plus";

import Icon from "metabase/components/Icon";

import type { Operator } from "./pickers/DatePicker";

type Props = {
    operator: ?string,
    operators: Operator[],
    onOperatorChange: (o: Operator) => void,
    hideTimeSelectors?: bool
}

type State = {
    expanded: bool
};

export default class DateOperatorSelector extends Component {
    props: Props;
    state: State;

    state = {
        expanded: false
    };

    toggleExpanded = () => {
        this.setState({ expanded: !this.state.expanded });
    }

    render() {
        const { operator, operators, onOperatorChange } = this.props;
        const { expanded } = this.state;

        return (
            <div className="mx2 relative z3">
                <div
                    className="flex align-center cursor-pointer text-purple-hover mb2 bordered rounded px2 py1"
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
                { expanded && (
                    <ul
                        className="text-purple bg-white absolute top left right bordered rounded shadowed"
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
                )}
            </div>
        );
    }
}
