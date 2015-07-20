'use strict';
/*global _*/

import AggregationWidget from './aggregation_widget.react';
import DataSelector from './data_selector.react';
import FilterWidget from './filter_widget.react';
import Icon from './icon.react';
import IconBorder from './icon_border.react';
import LimitWidget from './limit_widget.react';
import SelectionModule from './selection_module.react';
import SortWidget from './sort_widget.react';
import PopoverWithTrigger from './popover_with_trigger.react';

import Query from './query';

var cx = React.addons.classSet;
var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'GuiQueryEditor',
    propTypes: {
        databases: React.PropTypes.array.isRequired,
        query: React.PropTypes.object.isRequired,
        isShowingDataReference: React.PropTypes.bool.isRequired,
        setQueryFn: React.PropTypes.func.isRequired,
        setDatabaseFn: React.PropTypes.func.isRequired,
        setSourceTableFn: React.PropTypes.func.isRequired,
        toggleExpandCollapseFn: React.PropTypes.func.isRequired
    },

    setQuery: function(dataset_query) {
        this.props.setQueryFn(dataset_query);
    },

    addDimension: function() {
        Query.addDimension(this.props.query.query);
        this.setQuery(this.props.query);
    },

    updateDimension: function(dimension, index) {
        Query.updateDimension(this.props.query.query, dimension, index);
        this.setQuery(this.props.query);
    },

    removeDimension: function(index) {
        Query.removeDimension(this.props.query.query, index);
        this.setQuery(this.props.query);
    },

    updateAggregation: function(aggregationClause) {
        Query.updateAggregation(this.props.query.query, aggregationClause);
        this.setQuery(this.props.query);
    },

    addFilter: function() {
        Query.addFilter(this.props.query.query);
        this.setQuery(this.props.query);
    },

    updateFilter: function(index, filter) {
        Query.updateFilter(this.props.query.query, index, filter);
        this.setQuery(this.props.query);
    },

    removeFilter: function(index) {
        Query.removeFilter(this.props.query.query, index);
        this.setQuery(this.props.query);
    },

    addLimit: function() {
        Query.addLimit(this.props.query.query);
        this.setQuery(this.props.query);
    },

    updateLimit: function(limit) {
        if (limit) {
            Query.updateLimit(this.props.query.query, limit);
        } else {
            Query.removeLimit(this.props.query.query);
        }
        this.setQuery(this.props.query);
    },

    addSort: function() {
        Query.addSort(this.props.query.query);
        this.setQuery(this.props.query);
    },

    updateSort: function(index, sort) {
        Query.updateSort(this.props.query.query, index, sort);
        this.setQuery(this.props.query);
    },

    removeSort: function(index) {
        Query.removeSort(this.props.query.query, index);
        this.setQuery(this.props.query);
    },

    getSortableFields: function() {
        return Query.getSortableFields(this.props.query.query, this.props.options.fields_lookup);
    },

    renderAddIcon: function () {
        return (
            <IconBorder className="text-grey-2" borderRadius="3px">
                <Icon name="add" width="14px" height="14px" />
            </IconBorder>
        )
    },

    renderBreakouts: function() {
        // breakout clause.  must have table details available & a valid aggregation defined
        if (this.props.options &&
                this.props.options.breakout_options.fields.length > 0 &&
                !Query.hasEmptyAggregation(this.props.query.query)) {

            var breakoutLabel;
            var breakoutList;
            var addBreakoutButton;

            // only render a label for our breakout if we have a valid breakout clause already
            if(this.props.query.query.breakout.length > 0) {
                breakoutLabel = (
                    <span className="text-bold">
                        by
                    </span>
                );
            }

            // include a button to add a breakout, up to 2 total
            // don't include already used fields
            var usedFields = {};
            breakoutList = this.props.query.query.breakout.map((breakout, index) => {
                var breakoutListOpen = breakout === null;
                var unusedFields = this.props.options.breakout_options.fields.filter((f) => !usedFields[f[0]])

                if (breakout) {
                    usedFields[breakout] = true;
                }

                if (unusedFields.length === 0) {
                    return null;
                }

                return (
                    <div className="DimensionList inline-block" key={index}>
                        <SelectionModule
                            placeholder='...'
                            display="1"
                            items={unusedFields}
                            selectedValue={breakout}
                            selectedKey="0"
                            index={index}
                            isInitiallyOpen={breakoutListOpen}
                            action={this.updateDimension}
                            remove={this.removeDimension}
                        />
                    </div>
                );
            });

            var unusedFieldsCount = this.props.options.breakout_options.fields.length - Object.keys(usedFields).length;
            if (unusedFieldsCount > 0) {
                if (this.props.query.query.breakout.length === 0) {
                    addBreakoutButton = this.renderAdd("Add a grouping", this.addDimension);
                } else if (this.props.query.query.breakout.length === 1 &&
                                this.props.query.query.breakout[0] !== null) {
                    addBreakoutButton = this.renderAdd(null, this.addDimension);
                }
            }

            return (
                <div className="Query-section">
                    {breakoutLabel}
                    {breakoutList}
                    {addBreakoutButton}
                </div>
            );
        }
    },

    renderAdd: function(text, onClick) {
        if (text) {
            return (
                <a className="text-grey-2 text-bold no-decoration flex align-center" href="#" onClick={onClick}>
                    <span className="p1">{this.renderAddIcon()}</span>
                    <span>{text}</span>
                </a>
            );
        } else {
            return (
                <a className="text-grey-2 text-bold no-decoration" href="#" onClick={onClick}>
                    <span className="p1">{this.renderAddIcon()}</span>
                </a>
            )
        }
    },

    renderAggregation: function() {
        // aggregation clause.  must have table details available
        if(this.props.options) {
            return (
                <AggregationWidget
                    aggregation={this.props.query.query.aggregation}
                    aggregationOptions={this.props.options.aggregation_options}
                    updateAggregation={this.updateAggregation}>
                </AggregationWidget>
            );
        }
    },

    renderFilters: function() {
        var queryFilters = Query.getFilters(this.props.query.query);

        var filterList;
        var addFilterButton;

        if (this.props.options) {
            var filterFieldList = [];
            for(var key in this.props.options.fields_lookup) {
                filterFieldList.push(this.props.options.fields_lookup[key]);
            }

            if (queryFilters && queryFilters.length > 0) {
                filterList = queryFilters.map((filter, index) => {
                    if(index > 0) {
                        return (
                            <FilterWidget
                                key={filter[1]}
                                placeholder="Item"
                                filter={filter}
                                filterFieldList={filterFieldList}
                                index={index}
                                removeFilter={this.removeFilter}
                                updateFilter={this.updateFilter}
                            />
                        );
                    }
                });
            }

            // TODO: proper check for isFilterComplete(filter)
            if (Query.canAddFilter(this.props.query.query)) {
                if (filterList) {
                    addFilterButton = this.renderAdd(null, this.addFilter);
                } else {
                    addFilterButton = this.renderAdd("Add filters to narrow your answer", this.addFilter);
                }
            }
        }

        return (
            <div className="Query-section">
                <div className="Query-filters">
                    {filterList}
                    {addFilterButton}
                </div>
            </div>
        );
    },

    renderSort: function() {
        var sortList = [];
        if (this.props.query.query.order_by) {
            var sortableFields = this.getSortableFields();

            var component = this;
            sortList = this.props.query.query.order_by.map(function (order_by, index) {
                return (
                    <SortWidget
                        placeholder="Attribute"
                        sort={order_by}
                        fieldList={sortableFields}
                        index={index}
                        removeSort={component.removeSort}
                        updateSort={component.updateSort}
                    />
                );
            }.bind(this));
        }

        var sortSection;
        if (sortList.length === 0) {
            sortSection = (
                <div className="QueryOption p1 lg-p2 flex align-center">
                    <a onClick={this.addSort}>
                        {this.renderAddIcon()}
                        Add sort
                    </a>
                </div>
            );
        } else {
            var addSortButton;
            if (Query.canAddSort(this.props.query.query)) {
                addSortButton = (
                    <a onClick={this.addSort}>Add another sort</a>
                );
            }

            sortSection = (
                <div className="flex align-center">
                    <span className="m2">sorted by</span>
                    {sortList}
                    {addSortButton}
                </div>
            );
        }

        if (sortList.length > 0) {
            return sortList;
        } else {
            return this.renderAdd("Pick a field to sort by", this.addSort);
        }
    },

    renderDataSection: function() {
        return <DataSelector className="arrow-right" {...this.props}/>;
    },

    renderFilterSection: function() {
        return (
            <div className="GuiBuilder-section GuiBuilder-filtered-by flex align-center px2">
                <span className="GuiBuilder-section-label Query-label">Filtered by</span>
                {this.renderFilters()}
            </div>
        );
    },

    renderViewSection: function() {
        return (
            <div className="GuiBuilder-section GuiBuilder-view flex-full flex align-center px1">
                <span className="GuiBuilder-section-label Query-label">View</span>
                {this.renderAggregation()}
                {this.renderBreakouts()}
            </div>
        );
    },

    renderLimit: function() {
        var limitOptions = [undefined, 1, 10, 25, 100, 1000].map((count) => {
            var name = count || "None";
            var classes = cx({
                "Button": true,
                "Button--active":  count == this.props.query.query.limit
            });
            return (
                <li className={classes} key={count} onClick={this.updateLimit.bind(null, count)}>{name}</li>
            );
        });
        return (
            <ul className="Button-group Button-group--blue">
                {limitOptions}
            </ul>
        )
    },

    renderSortLimitSection: function() {
        var tetherOptions = {
            attachment: 'top right',
            targetAttachment: 'bottom center',
            targetOffset: '5px 20px'
        };

        var triggerElement = (<span className="EllipsisButton no-decoration text-grey-1 px1">…</span>);

        // TODO: use this logic
        if (this.props.options && !Query.hasEmptyAggregation(this.props.query.query) &&
                (this.props.query.query.limit !== undefined || this.props.query.query.order_by !== undefined)) {

        } else if (Query.canAddLimitAndSort(this.props.query.query)) {

        }

        return (
            <div className="GuiBuilder-section GuiBuilder-sort-limit flex align-center">

                <PopoverWithTrigger className="PopoverBody PopoverBody--withArrow"
                                    tetherOptions={tetherOptions}
                                    triggerElement={triggerElement}
                                    triggerClasses="flex align-center">
                    <div className="px3 py1">
                        <div className="py1 border-bottom">
                            <div className="Query-label mb1">Sort by:</div>
                            {this.renderSort()}
                        </div>
                        <div className="py1">
                            <div className="Query-label mb1">Limit:</div>
                            {this.renderLimit()}
                        </div>
                    </div>
                </PopoverWithTrigger>
            </div>
        );
    },

    render: function() {
        var classes = cx({
            'GuiBuilder': true,
            'GuiBuilder--narrow': this.props.isShowingDataReference,
            'bordered': true,
            'rounded': true
        })
        return (
            <div className="wrapper">
                <div className={classes}>
                    <div className="GuiBuilder-row flex">
                        {this.renderDataSection()}
                        {this.renderFilterSection()}
                    </div>
                    <div className="GuiBuilder-row flex flex-full">
                        {this.renderViewSection()}
                        {this.renderSortLimitSection()}
                    </div>
                </div>
            </div>
        );
    }
});
