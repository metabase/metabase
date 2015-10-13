import React, { Component, PropTypes } from "react";

import AggregationWidget from './AggregationWidget.jsx';
import DataSelector from './DataSelector.jsx';
import FieldWidget from './FieldWidget.jsx';
import FilterWidget from './filters/FilterWidget.jsx';
import FilterPopover from './filters/FilterPopover.jsx';
import Icon from "metabase/components/Icon.jsx";
import IconBorder from 'metabase/components/IconBorder.jsx';
import SortWidget from './SortWidget.jsx';
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import MetabaseAnalytics from 'metabase/lib/analytics';
import Query from "metabase/lib/query";

import cx from "classnames";
import _ from "underscore";

export default class GuiQueryEditor extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            expanded: true
        };

        _.bindAll(
            this,
            "addFilter", "updateFilter", "removeFilter",
            "updateAggregation",
            "addDimension", "updateDimension", "removeDimension",
            "addSort", "updateSort", "removeSort",
            "updateLimit"
        );
    }

    static propTypes = {
        databases: PropTypes.array.isRequired,
        query: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object, // can't be required, sometimes null
        isShowingDataReference: PropTypes.bool.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setDatabaseFn: PropTypes.func.isRequired,
        setSourceTableFn: PropTypes.func.isRequired,
        toggleExpandCollapseFn: PropTypes.func.isRequired
    };

    setQuery(dataset_query) {
        this.props.setQueryFn(dataset_query);
    }

    addDimension() {
        Query.addDimension(this.props.query.query);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Add GroupBy');
    }

    updateDimension(index, dimension) {
        Query.updateDimension(this.props.query.query, dimension, index);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Modify GroupBy');
    }

    removeDimension(index) {
        Query.removeDimension(this.props.query.query, index);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove GroupBy');
    }

    updateAggregation(aggregationClause) {
        Query.updateAggregation(this.props.query.query, aggregationClause);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Aggregation', aggregationClause[0]);
    }

    addFilter(filter) {
        let query = this.props.query.query;
        Query.addFilter(query);
        Query.updateFilter(query, Query.getFilters(query).length - 1, filter);

        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Add Filter');
    }

    updateFilter(index, filter) {
        Query.updateFilter(this.props.query.query, index, filter);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Modify Filter');
    }

    removeFilter(index) {
        Query.removeFilter(this.props.query.query, index);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Filter');
    }

    addLimit() {
        Query.addLimit(this.props.query.query);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Limit');
    }

    updateLimit(limit) {
        if (limit) {
            Query.updateLimit(this.props.query.query, limit);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Limit');
        } else {
            Query.removeLimit(this.props.query.query);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Limit');
        }
        this.setQuery(this.props.query);
    }

    addSort() {
        Query.addSort(this.props.query.query);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Sort', 'manual');
    }

    updateSort(index, sort) {
        Query.updateSort(this.props.query.query, index, sort);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Sort', 'manual');
    }

    removeSort(index) {
        Query.removeSort(this.props.query.query, index);
        this.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Sort');
    }

    renderAdd(text, onClick, targetRefName) {
        let className = "text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color";
        if (onClick) {
            return (
                <a className={className} onClick={onClick}>
                    {this.renderAddIcon(targetRefName)}
                    { text && <span className="ml1">{text}</span> }
                </a>
            );
        } else {
            return (
                <span className={className}>
                    {this.renderAddIcon(targetRefName)}
                    { text && <span className="ml1">{text}</span> }
                </span>
            );
        }
    }

    renderAddIcon(targetRefName) {
        return (
            <IconBorder borderRadius="3px" ref={targetRefName}>
                <Icon name="add" width="14px" height="14px" />
            </IconBorder>
        )
    }

    renderFilters() {
        let enabled;
        let filterList;
        let addFilterButton;

        if (this.props.tableMetadata) {
            enabled = true;

            let queryFilters = Query.getFilters(this.props.query.query);
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
                    addFilterButton = this.renderAdd(null, null, "addFilterTarget");
                } else {
                    addFilterButton = this.renderAdd("Add filters to narrow your answer", null, "addFilterTarget");
                }
            }
        } else {
            enabled = false;
            addFilterButton = this.renderAdd("Add filters to narrow your answer", null, "addFilterTarget");
        }

        return (
            <div className={cx("Query-section", { disabled: !enabled })}>
                <div className="Query-filters">
                    {filterList}
                </div>
                <div className="mx2">
                <PopoverWithTrigger ref="filterPopover"
                                    triggerElement={addFilterButton}
                                    triggerClasses="flex align-center"
                                    getTriggerTarget={() => this.refs.addFilterTarget}
                >
                    <FilterPopover
                        isNew={true}
                        tableMetadata={this.props.tableMetadata || {}}
                        onCommitFilter={this.addFilter}
                        onClose={() => this.refs.filterPopover.close()}
                    />
                </PopoverWithTrigger>
                </div>
            </div>
        );
    }

    renderAggregation() {
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
    }

    renderBreakouts() {
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
                        color="green"
                        className="View-section-breakout SelectionModule p1"
                        placeholder='field'
                        field={breakout}
                        fieldOptions={fieldOptions}
                        tableMetadata={this.props.tableMetadata}
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
    }

    renderSort() {
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
                        tableMetadata={this.props.tableMetadata}
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
    }

    renderLimit() {
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
    }

    renderDataSection() {
        var isInitiallyOpen = !this.props.query.database || !this.props.query.query.source_table;
        return (
            <DataSelector
                ref="dataSection"
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
    }

    renderFilterSection() {
        return (
            <div className="GuiBuilder-section GuiBuilder-filtered-by flex align-center" ref="filterSection">
                <span className="GuiBuilder-section-label Query-label">Filtered by</span>
                {this.renderFilters()}
            </div>
        );
    }

    renderViewSection() {
        return (
            <div className="GuiBuilder-section GuiBuilder-view flex align-center px1" ref="viewSection">
                <span className="GuiBuilder-section-label Query-label">View</span>
                {this.renderAggregation()}
                {this.renderBreakouts()}
            </div>
        );
    }

    renderSortLimitSection() {
        var triggerElement = (<span className="EllipsisButton no-decoration text-grey-1 px1">…</span>);

        // TODO: use this logic
        if (this.props.tableMetadata && !Query.hasEmptyAggregation(this.props.query.query) &&
                (this.props.query.query.limit !== undefined || this.props.query.query.order_by !== undefined)) {

        } else if (Query.canAddLimitAndSort(this.props.query.query)) {

        }

        return (
            <div className="GuiBuilder-section GuiBuilder-sort-limit flex align-center" ref="sortLimitSection">

                <PopoverWithTrigger triggerElement={triggerElement}
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
    }

    componentDidUpdate() {
        // HACK: magic number "5" accounts for the borders between the sections?
        let contentWidth = ["data", "filter", "view", "sortLimit"].reduce((acc, ref) => acc + React.findDOMNode(this.refs[`${ref}Section`]).offsetWidth, 0) + 5;
        let guiBuilderWidth = React.findDOMNode(this.refs.guiBuilder).offsetWidth;

        let expanded = (contentWidth < guiBuilderWidth);
        if (this.state.expanded !== expanded) {
            this.setState({ expanded });
        }
    }

    render() {
        var classes = cx({
            'GuiBuilder': true,
            'GuiBuilder--expand': this.state.expanded,
            'rounded': true,
            'shadowed': true
        });
        return (
            <div className="wrapper">
                <div className={classes} ref="guiBuilder">
                    <div className="GuiBuilder-row flex">
                        {this.renderDataSection()}
                        {this.renderFilterSection()}
                    </div>
                    <div className="GuiBuilder-row flex flex-full">
                        {this.renderViewSection()}
                        <div className="flex-full"></div>
                        {this.renderSortLimitSection()}
                    </div>
                </div>
            </div>
        );
    }
}
