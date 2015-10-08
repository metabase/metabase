import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import SelectionModule from './SelectionModule.jsx';

export default class LimitWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.setLimit = this.setLimit.bind(this);
    }

    static propTypes = {
        limit: PropTypes.number,
        updateLimit: PropTypes.func.isRequired,
        removeLimit: PropTypes.func.isRequired
    };

    static defaultProps = {
        options: [
            {key: "All rows", val: null},
            {key: "1 row", val: 1},
            {key: "10 rows", val: 10},
            {key: "25 rows", val: 25},
            {key: "50 rows", val: 50},
            {key: "100 rows", val: 100},
            {key: "1000 rows", val: 1000}
        ]
    };

    setLimit(value) {
        if (this.props.limit !== value) {
            this.props.updateLimit(value);
        }
    }

    render() {
        return (
            <div className="Query-filter">
                <div className='Filter-section'>
                    <SelectionModule
                        placeholder="How many rows?"
                        items={this.props.options}
                        display="key"
                        selectedKey="val"
                        selectedValue={this.props.limit || null}
                        isInitiallyOpen={false}
                        action={this.setLimit}
                    />
                </div>

                <a onClick={this.props.removeLimit}>
                    <Icon name='close' width="12px" height="12px" />
                </a>
            </div>
        );
    }
}
