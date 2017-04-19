import React, { Component } from "react";
import PropTypes from "prop-types";
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

import Query from "metabase/lib/query";

import cx from "classnames";
import _ from "underscore";


export default class GuiQueryEditor extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            expanded: true
        };
    }

    static propTypes = {
        databases: PropTypes.array,
        datasetQuery: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object, // can't be required, sometimes null
        isShowingDataReference: PropTypes.bool.isRequired,
        setDatasetQuery: PropTypes.func.isRequired,
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

    renderAdd(text, onClick, targetRefName) {
        let className = "AddButton text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color";
        if (onClick) {
            return (
                <a className={className} onClick={onClick}>
                    { text && <span className="mr1">{text}</span> }
                    {this.renderAddIcon(targetRefName)}
                </a>
            );
        } else {
            return (
                <span className={className}>
                    { text && <span className="mr1">{text}</span> }
                    {this.renderAddIcon(targetRefName)}
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

            let filters = Query.getFilters(this.props.datasetQuery.query);
            if (filters && filters.length > 0) {
                filterList = (
                    <FilterList
                        filters={filters}
                        tableMetadata={this.props.tableMetadata}
                        removeFilter={this.props.removeQueryFilter}
                        updateFilter={this.props.updateQueryFilter}
                    />
                );
            }

            if (Query.canAddFilter(this.props.datasetQuery.query)) {
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
                        horizontalAttachments={["left"]}
                    >
                        <FilterPopover
                            isNew={true}
                            tableMetadata={this.props.tableMetadata || {}}
                            customFields={Query.getExpressions(this.props.datasetQuery.query)}
                            onCommitFilter={this.props.addQueryFilter}
                            onClose={() => this.refs.filterPopover.close()}
                        />
                    </PopoverWithTrigger>
                </div>
            </div>
        );
    }

    renderAggregation() {
        const { datasetQuery: { query }, tableMetadata } = this.props;

        if (!this.props.features.aggregation) {
            return;
        }

        // aggregation clause.  must have table details available
        if (tableMetadata) {
            let isBareRows = Query.isBareRows(query);
            let aggregations = Query.getAggregations(query);

            if (aggregations.length === 0) {
                // add implicit rows aggregation
                aggregations.push(["rows"]);
            }

            const canRemoveAggregation = aggregations.length > 1;

            if (!isBareRows) {
                aggregations.push([]);
            }

            let aggregationList = [];
            for (const [index, aggregation] of aggregations.entries()) {
                aggregationList.push(
                    <AggregationWidget
                        key={"agg"+index}
                        aggregation={aggregation}
                        tableMetadata={tableMetadata}
                        customFields={Query.getExpressions(this.props.datasetQuery.query)}
                        updateAggregation={(aggregation) => this.props.updateQueryAggregation(index, aggregation)}
                        removeAggregation={canRemoveAggregation ? this.props.removeQueryAggregation.bind(null, index) : null}
                        addButton={this.renderAdd(null)}
                    />
                );
                if (aggregations[index + 1] != null && aggregations[index + 1].length > 0) {
                    aggregationList.push(
                        <span key={"and"+index} className="text-bold">and</span>
                    );
                }
            }
            return aggregationList
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
        const { datasetQuery: { query }, tableMetadata, features } = this.props;

        if (!features.breakout) {
            return;
        }

        const enabled = tableMetadata && tableMetadata.breakout_options.fields.length > 0;
        const breakoutList = [];

        if (enabled) {
            const breakouts = Query.getBreakouts(query);

            const usedFields = {};
            for (const breakout of breakouts) {
                usedFields[Query.getFieldTargetId(breakout)] = true;
            }

            const remainingFieldOptions = Query.getFieldOptions(tableMetadata.fields, true, tableMetadata.breakout_options.validFieldsFilter, usedFields);
            if (remainingFieldOptions.count > 0 && (breakouts.length === 0 || breakouts[breakouts.length - 1] != null)) {
                breakouts.push(null);
            }

            for (let i = 0; i < breakouts.length; i++) {
                const breakout = breakouts[i];

                if (breakout == null) {
                    breakoutList.push(<span key="nullBreakout" className="ml1" />);
                }

                breakoutList.push(
                    <BreakoutWidget
                        key={"breakout"+i}
                        className="View-section-breakout SelectionModule p1"
                        fieldOptions={Query.getFieldOptions(tableMetadata.fields, true, tableMetadata.breakout_options.validFieldsFilter, _.omit(usedFields, breakout))}
                        customFieldOptions={Query.getExpressions(query)}
                        tableMetadata={tableMetadata}
                        field={breakout}
                        setField={(field) => this.props.updateQueryBreakout(i, field)}
                        addButton={this.renderAdd(i === 0 ? "Add a grouping" : null)}
                    />
                );

                if (breakouts[i + 1] != null) {
                    breakoutList.push(
                        <span key={"and"+i} className="text-bold">and</span>
                    );
                }
            }
        }

        return (
            <div className={cx("Query-section Query-section-breakout", { disabled: !enabled })}>
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
                        datasetQuery={this.props.datasetQuery}
                        databases={this.props.databases}
                        tables={this.props.tables}
                        setDatabaseFn={this.props.setDatabaseFn}
                        setSourceTableFn={this.props.setSourceTableFn}
                        isInitiallyOpen={(!this.props.datasetQuery.database || !this.props.datasetQuery.query.source_table) && !this.props.isShowingTutorial}
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
            <div className="GuiBuilder-section GuiBuilder-view flex align-center px1 pr2" ref="viewSection">
                <span className="GuiBuilder-section-label Query-label">View</span>
                {this.renderAggregation()}
            </div>
        );
    }

    renderGroupedBySection() {
        const { features } = this.props;
        if (!features.aggregation && !features.breakout) {
            return;
        }

        return (
            <div className="GuiBuilder-section GuiBuilder-groupedBy flex align-center px1" ref="viewSection">
                <span className="GuiBuilder-section-label Query-label">Grouped By</span>
                {this.renderBreakouts()}
            </div>
        );
    }

    componentDidUpdate() {
        const guiBuilder = ReactDOM.findDOMNode(this.refs.guiBuilder);
        if (!guiBuilder) {
            return;
        }

        // HACK: magic number "5" accounts for the borders between the sections?
        let contentWidth = ["data", "filter", "view", "groupedBy","sortLimit"].reduce((acc, ref) => {
            let node = ReactDOM.findDOMNode(this.refs[`${ref}Section`]);
            return acc + (node ? node.offsetWidth : 0);
        }, 0) + 5;
        let guiBuilderWidth = guiBuilder.offsetWidth;

        let expanded = (contentWidth < guiBuilderWidth);
        if (this.state.expanded !== expanded) {
            this.setState({ expanded });
        }
    }

    render() {
        const { datasetQuery, databases } = this.props;
        const readOnly = datasetQuery.database != null && !_.findWhere(databases, { id: datasetQuery.database });
        if (readOnly) {
            return <div className="border-bottom border-med" />
        }

        return (
            <div className={cx("GuiBuilder rounded shadowed", { "GuiBuilder--expand": this.state.expanded, disabled: readOnly })} ref="guiBuilder">
                <div className="GuiBuilder-row flex">
                    {this.renderDataSection()}
                    {this.renderFilterSection()}
                </div>
                <div className="GuiBuilder-row flex flex-full">
                    {this.renderViewSection()}
                    {this.renderGroupedBySection()}
                    <div className="flex-full"></div>
                    {this.props.children}
                    <ExtendedOptions
                        {...this.props}
                    />
                </div>
            </div>
        );
    }
}
