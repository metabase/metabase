import React, { Component, PropTypes } from "react";
import Icon from "metabase/components/Icon";
import { titleCase } from "humanize-plus";

export default class OperatorSelector extends Component {
    constructor() {
        super();

        this.state = {
            expanded: false
        };

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
            <div>
                <div
                    className="flex align-center"
                    onClick={() => this.toggleExpanded()}
                >
                    <h2>{titleCase(operator)}</h2>
                    <Icon name='chevrondown' />
                </div>
                <ul style={{
                    height: expanded ? 'auto' : 0,
                    overflow: 'hidden',
                    display: 'block',
                }}>
                    { operators.map(operator =>
                        <li
                            key={operator.name}
                            onClick={() => {
                                onOperatorChange(operator);
                                this.toggleExpanded();
                            }}
                        >
                            {operator.name}
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}
