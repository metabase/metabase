import React, { Component, PropTypes } from "react";

import FilterWidget from './FilterWidget.jsx';

export default class FilterList extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    render() {
        const { filters, tableMetadata } = this.props;
        return (
        <div className="Query-filterList">
                {filters.slice(1).map((filter, index) =>
                    <FilterWidget
                        key={index}
                        placeholder="Item"
                        filter={filter}
                        tableMetadata={tableMetadata}
                        index={index+1}
                        removeFilter={this.props.removeFilter}
                        updateFilter={this.props.updateFilter}
                        maxDisplayValues={this.props.maxDisplayValues}
                    />
                )}
            </div>
        );
    }
}
