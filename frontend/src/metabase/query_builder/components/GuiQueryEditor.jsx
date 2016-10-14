import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import AggregationWidget from './AggregationWidget.jsx';
import BreakoutWidget from './BreakoutWidget.jsx';
import DataSelector from './DataSelector.jsx';
import ExtendedOptions from "./ExtendedOptions.jsx";
import FilterList from './filters/FilterList.jsx';
import FilterPopover from './filters/FilterPopover.jsx';
import Icon from "metabase/components/Icon.jsx";
import IconBorder from 'metabase/components/IconBorder.jsx';
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
            "setBreakout",
        );
    }

    static propTypes = {
        databases: PropTypes.array,
        query: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object, // can't be required, sometimes null
        isShowingDataReference: PropTypes.bool.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setDatabaseFn: PropTypes.func,
        setSourceTableFn: PropTypes.func,
        features: PropTypes.object
    };

    static defaultProps = {
        features: {
            data: true,
            filter: true,
            aggregation: true,
            breakout: true,
            sort: true,
            limit: true
        }
    };

    setQuery(datasetQuery) {
        this.props.setQueryFn(datasetQuery);
    }

    setBreakout(index, field) {
        if (field == null) {
            Query.removeDimension(this.props.query.query, index);
            this.setQuery(this.props.query);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove GroupBy');
        } else {
            let isNew = index+1 > this.props.query.query.breakout.length;
            Query.updateDimension(this.props.query.query, field, index);
            this.setQuery(this.props.query);

            if (isNew) {
                MetabaseAnalytics.trackEvent('QueryBuilder', 'Add GroupBy');
            } else {
                MetabaseAnalytics.trackEvent('QueryBuilder', 'Modify GroupBy');
            }
        }
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

    renderAdd(text, onClick, targetRefName) {
        let className = "AddButton text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color";
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
                <Icon name="add" size={14} />
            </IconBorder>
        )
    }

    renderFilters() {
        if (!this.props.features.filter) return;

        let enabled;
        let filterList;
        let addFilterButton;

        if (this.props.tableMetadata) {
            enabled = true;

            let filters = Query.getFilters(this.props.query.query);
            if (filters && filters.length > 0) {
                filterList = (
                    <FilterList
                        filters={filters}
                        tableMetadata={this.props.tableMetadata}
                        removeFilter={this.removeFilter}
                        updateFilter={this.updateFilter}
                    />
                );
            }

            // TODO: proper check for isFilterComplete(filter)
            if (Query.canAddFilter(this.props.query.query)) {
                addFilterButton = this.renderAdd((filterList ? null : "Add filters to narrow your answer"), null, "addFilterTarget");
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
                    <PopoverWithTrigger
                        id="FilterPopover"
                        ref="filterPopover"
                        triggerElement={addFilterButton}
                        triggerClasses="flex align-center"
                        getTarget={() => this.refs.addFilterTarget}
                    >
                        <FilterPopover
                            isNew={true}
                            tableMetadata={this.props.tableMetadata || {}}
                            customFields={Query.getExpressions(this.props.query.query)}
                            onCommitFilter={this.addFilter}
                            onClose={() => this.refs.filterPopover.close()}
                        />
                    </PopoverWithTrigger>
                </div>
            </div>
        );
    }

    renderAggregation() {
        if (!this.props.features.aggregation) {
            return;
        }

        // aggregation clause.  must have table details available
        if (this.props.tableMetadata) {
            return (
                <AggregationWidget
                    aggregation={this.props.query.query.aggregation}
                    tableMetadata={this.props.tableMetadata}
                    customFields={Query.getExpressions(this.props.query.query)}
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
        if (!this.props.features.breakout) {
            return;
        }

        var enabled = (this.props.tableMetadata &&
                       this.props.tableMetadata.breakout_options.fields.length > 0 &&
                       !Query.hasEmptyAggregation(this.props.query.query));
        var breakoutList = [];

        const breakout = this.props.query.query.breakout;
        if (enabled) {
            if (breakout.length === 0) {
                // no breakouts specified yet, so just render a single widget
                breakoutList.push(
                    <BreakoutWidget
                        className="View-section-breakout SelectionModule p1"
                        fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true, this.props.tableMetadata.breakout_options.validFieldsFilter, {})}
                        customFieldOptions={Query.getExpressions(this.props.query.query)}
                        tableMetadata={this.props.tableMetadata}
                        setField={(field) => this.setBreakout(0, field)}
                        addButton={this.renderAdd("Add a grouping")}
                    />
                );

            } else {
                // we have 1+ defined breakouts, so provide 2 widgets
                breakoutList.push(
                    <span className="text-bold">by</span>
                );

                breakoutList.push(
                    <BreakoutWidget
                        key={"breakout0"}
                        className="View-section-breakout SelectionModule p1"
                        fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true, this.props.tableMetadata.breakout_options.validFieldsFilter, {})}
                        customFieldOptions={Query.getExpressions(this.props.query.query)}
                        tableMetadata={this.props.tableMetadata}
                        field={breakout[0]}
                        setField={(fieldId) => this.setBreakout(0, fieldId)}
                    />
                );

                if (breakout.length === 2) {
                    breakoutList.push(
                        <span className="text-bold">and</span>
                    );
                }

                breakoutList.push(
                    <BreakoutWidget
                        key={"breakout1"}
                        className="View-section-breakout SelectionModule p1"
                        fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true, this.props.tableMetadata.breakout_options.validFieldsFilter, {[breakout[0]]: true})}
                        customFieldOptions={Query.getExpressions(this.props.query.query)}
                        tableMetadata={this.props.tableMetadata}
                        field={breakout.length > 1 ? breakout[1] : null}
                        setField={(field) => this.setBreakout(1, field)}
                        addButton={this.renderAdd()}
                    />
                );
            }
        }

        return (
            <div className={cx("Query-section Query-section-breakout ml1", { disabled: !enabled })}>
                {breakoutList}
            </div>
        );
    }

    renderDataSection() {
        return (
            <div className={"GuiBuilder-section GuiBuilder-data flex align-center arrow-right"}>
                <span className="GuiBuilder-section-label Query-label">Data</span>
                { this.props.features.data ?
                    <DataSelector
                        ref="dataSection"
                        includeTables={true}
                        query={this.props.query}
                        databases={this.props.databases}
                        tables={this.props.tables}
                        setDatabaseFn={this.props.setDatabaseFn}
                        setSourceTableFn={this.props.setSourceTableFn}
                        isInitiallyOpen={(!this.props.query.database || !this.props.query.query.source_table) && !this.props.isShowingTutorial}
                    />
                    :
                    <span className="flex align-center px2 py2 text-bold text-grey">
                        {this.props.tableMetadata && this.props.tableMetadata.display_name}
                    </span>
                }
            </div>
        );
    }

    renderFilterSection() {
        if (!this.props.features.filter) {
            return;
        }

        return (
            <div className="GuiBuilder-section GuiBuilder-filtered-by flex align-center" ref="filterSection">
                <span className="GuiBuilder-section-label Query-label">Filtered by</span>
                {this.renderFilters()}
            </div>
        );
    }

    renderViewSection() {
        const { features } = this.props;
        if (!features.aggregation && !features.breakout) {
            return;
        }

        return (
            <div className="GuiBuilder-section GuiBuilder-view flex align-center px1" ref="viewSection">
                <span className="GuiBuilder-section-label Query-label">View</span>
                {this.renderAggregation()}
                {this.renderBreakouts()}
            </div>
        );
    }

    componentDidUpdate() {
        // HACK: magic number "5" accounts for the borders between the sections?
        let contentWidth = ["data", "filter", "view", "sortLimit"].reduce((acc, ref) => {
            let node = ReactDOM.findDOMNode(this.refs[`${ref}Section`]);
            return acc + (node ? node.offsetWidth : 0);
        }, 0) + 5;
        let guiBuilderWidth = ReactDOM.findDOMNode(this.refs.guiBuilder).offsetWidth;

        let expanded = (contentWidth < guiBuilderWidth);
        if (this.state.expanded !== expanded) {
            this.setState({ expanded });
        }
    }

    render() {
        return (
            <div className={cx("GuiBuilder rounded shadowed", { "GuiBuilder--expand": this.state.expanded })} ref="guiBuilder">
                <div className="GuiBuilder-row flex">
                    {this.renderDataSection()}
                    {this.renderFilterSection()}
                </div>
                <div className="GuiBuilder-row flex flex-full">
                    {this.renderViewSection()}
                    <div className="flex-full"></div>
                    {this.props.children}
                    <ExtendedOptions
                        {...this.props}
                        setQuery={(query) => this.setQuery(query)}
                    />
                </div>
            </div>
        );
    }
}
