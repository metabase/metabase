import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";

import FilterList from "metabase/query_builder/filters/FilterList.jsx";
import FilterPopover from "metabase/query_builder/filters/FilterPopover.jsx";
import Icon from "metabase/components/Icon.jsx";
import IconBorder from 'metabase/components/IconBorder.jsx';
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import { FilterClause } from "metabase/lib/query";


export default class Filters extends Component {
    constructor(props, context) {
        super(props, context);
        
        _.bindAll(this, "addFilter", "updateFilter", "removeFilter");
    }

    static propTypes = {
        filters: PropTypes.array.isRequired,
        tableMetadata: PropTypes.object,
        onChange: PropTypes.func.isRequired
    };

    addFilter(filter) {
        this.props.onChange(FilterClause.addFilter(this.props.filters, filter));
    }

    updateFilter(index, filter) {
        this.props.onChange(FilterClause.updateFilter(this.props.filters, index, filter));
    }

    removeFilter(index) {
        this.props.onChange(FilterClause.removeFilter(this.props.filters, index));
    }

    renderAddFilterButton(filterList) {
        const text = !filterList ? "Add a filter" : null;
        return (
            <span className="text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color">
                <IconBorder borderRadius="3px" ref="addFilterTarget">
                    <Icon name="add" width="14px" height="14px" />
                </IconBorder>
                { text && <span className="ml1">{text}</span> }
            </span>
        );
    }

    render() {
        const { filters, tableMetadata } = this.props;

        let filterList;
        if (tableMetadata && filters && filters.length > 0) {
            filterList = (
                <FilterList
                    filters={filters}
                    tableMetadata={tableMetadata}
                    removeFilter={this.removeFilter}
                    updateFilter={this.updateFilter}
                />
            );
        }

        return (
            <div className={cx("flex align-center", { disabled: !tableMetadata })}>
                <div className="">
                    {filterList}
                </div>
                <div className="">
                    <PopoverWithTrigger 
                        ref="filterPopover"
                        triggerElement={this.renderAddFilterButton(filterList)}
                        triggerClasses="flex align-center"
                        getTarget={() => this.refs.addFilterTarget}
                    >
                        <FilterPopover
                            isNew={true}
                            tableMetadata={tableMetadata || {}}
                            onCommitFilter={this.addFilter}
                            onClose={() => this.refs.filterPopover.close()}
                        />
                    </PopoverWithTrigger>
                </div>
            </div>
        );
    }
}
