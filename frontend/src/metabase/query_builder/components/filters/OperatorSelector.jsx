import React, { Component, PropTypes } from "react";
import ReactCSSTransitionGroup from "react-addons-css-transition-group";

import Icon from "metabase/components/Icon";
import { titleCase } from "humanize-plus";

export default class OperatorSelector extends Component {
    constructor() {
        super();
        this.state = { expanded: false };

        this.toggleExpanded = this.toggleExpanded.bind(this);
    }

    static propTypes = {
        operator: PropTypes.string,
        operators: PropTypes.array.isRequired,
        onOperatorChange: PropTypes.func.isRequired
    };

    toggleExpanded () {
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
                    <Icon name='chevrondown' />
                </div>
                <ul
                    style={{
                        height: expanded ? 'auto' : 0,
                        overflow: 'hidden',
                        display: 'block',
                    }}
                >
                    { operators.map(operator =>
                        <li
                            className="cursor-pointer mb1 text-purple-hover"
                            key={operator.name}
                            onClick={() => {
                                onOperatorChange(operator);
                                this.toggleExpanded();
                            }}
                        >
                            <h4>{operator.name}</h4>
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}
