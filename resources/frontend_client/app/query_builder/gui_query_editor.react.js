'use strict';
/*global _*/

import MetabaseAnalytics from '../lib/analytics';

import AggregationWidget from './aggregation_widget.react';
import DataSelector from './data_selector.react';
import FieldWidget from './field_widget.react';
import FilterWidget from './filter_widget.react';
import Icon from "metabase/components/Icon.react";
import IconBorder from './icon_border.react';
import LimitWidget from './limit_widget.react';
import SortWidget from './sort_widget.react';
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";

import Query from "metabase/lib/query";

var cx = React.addons.classSet;
var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'GuiQueryEditor',
    propTypes: {
        databases: React.PropTypes.array.isRequired,
        query: React.PropTypes.object.isRequired,
        tableMetadata: React.PropTypes.object, // can't be required, sometimes null
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

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Add GroupBy');
    },

    updateDimension: function(index, dimension) {
        Query.updateDimension(this.props.query.query, dimension, index);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Modify GroupBy');
    },

    removeDimension: function(index) {
        Query.removeDimension(this.props.query.query, index);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove GroupBy');
    },

    updateAggregation: function(aggregationClause) {
        Query.updateAggregation(this.props.query.query, aggregationClause);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Aggregation', aggregationClause[0]);
    },

    addFilter: function() {
        Query.addFilter(this.props.query.query);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Add Filter');
    },

    updateFilter: function(index, filter) {
        Query.updateFilter(this.props.query.query, index, filter);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Modify Filter');
    },

    removeFilter: function(index) {
        Query.removeFilter(this.props.query.query, index);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Filter');
    },

    addLimit: function() {
        Query.addLimit(this.props.query.query);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Limit');
    },

    updateLimit: function(limit) {
        if (limit) {
            Query.updateLimit(this.props.query.query, limit);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Limit');
        } else {
            Query.removeLimit(this.props.query.query);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Limit');
        }
        this.setQuery(this.props.query);
    },

    addSort: function() {
        Query.addSort(this.props.query.query);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Sort', 'manual');
    },

    updateSort: function(index, sort) {
        Query.updateSort(this.props.query.query, index, sort);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Sort', 'manual');
    },

    removeSort: function(index) {
        Query.removeSort(this.props.query.query, index);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Sort');
    },

    renderAdd: function(text, onClick) {
        let classes = "text-grey-2 text-grey-4-hover cursor-pointer text-bold no-decoration flex align-center mx2 transition-color";
        return (
            <a className={classes} onClick={onClick}>
                {this.renderAddIcon()}
                { text ? (<span className="ml1">{text}</span>) : (null) }
            </a>
        )
    },

    renderAddIcon: function () {
        return (
            <IconBorder borderRadius="3px">
                <Icon name="add" width="14px" height="14px" />
            </IconBorder>
        )
    },

    renderDbSelector: function() {
        if(this.props.databases && this.props.databases.length > 1) {
            return (
                <div className={this.props.querySectionClasses + ' mt1 lg-mt2'}>
                    <span className="Query-label">Data source:</span>
                    <DatabaseSelector
                        databases={this.props.databases}
                        setDatabase={this.setDatabase}
                        currentDatabaseId={this.props.query.database}
                    />
                </div>
            );
        }
    },

    renderFilters: function() {
        var enabled;
        var filterList;
        var addFilterButton;

        if (this.props.tableMetadata) {
            enabled = true;

            var queryFilters = Query.getFilters(this.props.query.query);
            if (queryFilters && queryFilters.length > 0) {
                filterList = queryFilters.map((filter, index) => {
                    if(index > 0) {
                        return (
                            <FilterWidget
                                key={index}
                                placeholder="Item"
                                filter={filter}
                                tableMetadata={this.props.tableMetadata}
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
        } else {
            enabled = false;
            addFilterButton = this.renderAdd("Add filters to narrow your answer", this.addFilter);
        }

        var querySectionClasses = cx({
            "Query-section": true,
            disabled: !enabled
        });
        return (
            <div className={querySectionClasses}>
                <div className="Query-filters">
                    {filterList}
                </div>
                {addFilterButton}
            </div>
        );
    },

    renderAggregation: function() {
        // aggregation clause.  must have table details available
        if (this.props.tableMetadata) {
            return (
                <AggregationWidget
                    aggregation={this.props.query.query.aggregation}
                    tableMetadata={this.props.tableMetadata}
                    updateAggregation={this.updateAggregation}
                />
            );
        } else {
            // TODO: move this into AggregationWidget?
            return (
                <div className="Query-section Query-section-aggregation disabled">
                    <a className="QueryOption p1 flex align-center">Raw data</a>
                </div>
            );
        }
    },

    renderBreakouts: function() {
        var enabled;
        var breakoutList;
        var addBreakoutButton;

        // breakout clause.  must have table details available & a valid aggregation defined
        if (this.props.tableMetadata &&
                this.props.tableMetadata.breakout_options.fields.length > 0 &&
                !Query.hasEmptyAggregation(this.props.query.query)) {
            enabled = true;

            // include a button to add a breakout, up to 2 total
            // don't include already used fields
            var usedFields = {};
            breakoutList = []
            this.props.query.query.breakout.forEach((breakout, index) => {
                var breakoutListOpen = breakout === null;
                var fieldOptions = Query.getFieldOptions(this.props.tableMetadata.fields, true, this.props.tableMetadata.breakout_options.validFieldsFilter, usedFields);

                if (breakout) {
                    usedFields[breakout] = true;
                }

                if (fieldOptions.count === 0) {
                    return null;
                }

                breakoutList.push(
                    <span key={"_"+index} className="text-bold">
                        {breakoutList.length > 0 ? "and" : "by"}
                    </span>
                );

                breakoutList.push(
                    <FieldWidget
                        key={index}
                        className="View-section-breakout SelectionModule p1"
                        placeholder='field'
                        field={breakout}
                        fieldOptions={fieldOptions}
                        tableName={this.props.tableMetadata.display_name}
                        isInitiallyOpen={breakoutListOpen}
                        setField={this.updateDimension.bind(null, index)}
                        removeField={this.removeDimension.bind(null, index)}
                    />
                );
            });

            var remainingFieldOptions = Query.getFieldOptions(this.props.tableMetadata.fields, true, this.props.tableMetadata.breakout_options.validFieldsFilter, usedFields);
            if (remainingFieldOptions.count > 0) {
                if (this.props.query.query.breakout.length === 0) {
                    addBreakoutButton = this.renderAdd("Add a grouping", this.addDimension);
                } else if (this.props.query.query.breakout.length === 1 &&
                                this.props.query.query.breakout[0] !== null) {
                    addBreakoutButton = this.renderAdd(null, this.addDimension);
                }
            }
        } else {
            enabled = false;
            addBreakoutButton = this.renderAdd("Add a grouping", this.addDimension);
        }

        var querySectionClasses = cx({
            "Query-section": true,
            ml1: true,
            disabled: !enabled
        });
        return (
            <div className={querySectionClasses}>
                {breakoutList}
                {addBreakoutButton}
            </div>
        );
    },

    renderSort: function() {
        var sortFieldOptions;

        if (this.props.tableMetadata) {
            sortFieldOptions = Query.getFieldOptions(
                this.props.tableMetadata.fields,
                true,
                Query.getSortableFields.bind(null, this.props.query.query)
            );
        }

        var sortList = [];
        if (this.props.query.query.order_by && this.props.tableMetadata) {
            sortList = this.props.query.query.order_by.map((order_by, index) => {
                return (
                    <SortWidget
                        key={index}
                        tableName={this.props.tableMetadata.display_name}
                        sort={order_by}
                        fieldOptions={sortFieldOptions}
                        removeSort={this.removeSort.bind(null, index)}
                        updateSort={this.updateSort.bind(null, index)}
                    />
                );
            });
        }

        var content;
        if (sortList.length > 0) {
            content = sortList;
        } else if (sortFieldOptions && sortFieldOptions.count > 0) {
            content = this.renderAdd("Pick a field to sort by", this.addSort);
        }

        if (content) {
            return (
                <div className="py1 border-bottom">
                    <div className="Query-label mb1">Sort by:</div>
                    {content}
                </div>
            );
        }
    },

    renderLimit: function() {
        var limitOptions = [undefined, 1, 10, 25, 100, 1000].map((count) => {
            var name = count || "None";
            var classes = cx({
                "Button": true,
                "Button--active":  count == this.props.query.query.limit
            });
            return (
                <li key={name} className={classes} onClick={this.updateLimit.bind(null, count)}>{name}</li>
            );
        });
        return (
            <ul className="Button-group Button-group--blue">
                {limitOptions}
            </ul>
        )
    },

    renderDataSection: function() {
        var isInitiallyOpen = !this.props.query.database || !this.props.query.query.source_table;
        return (
            <DataSelector
                className="arrow-right"
                includeTables={true}
                query={this.props.query}
                databases={this.props.databases}
                tables={this.props.tables}
                setDatabaseFn={this.props.setDatabaseFn}
                setSourceTableFn={this.props.setSourceTableFn}
                isInitiallyOpen={isInitiallyOpen}
            />
        );
    },

    renderFilterSection: function() {
        return (
            <div className="GuiBuilder-section GuiBuilder-filtered-by flex align-center">
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

    renderSortLimitSection: function() {
        var tetherOptions = {
            attachment: 'top right',
            targetAttachment: 'bottom center',
            targetOffset: '5px 20px'
        };

        var triggerElement = (<span className="EllipsisButton no-decoration text-grey-1 px1">…</span>);

        // TODO: use this logic
        if (this.props.tableMetadata && !Query.hasEmptyAggregation(this.props.query.query) &&
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
                        {this.renderSort()}
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
            'rounded': true,
            'shadowed': true
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
