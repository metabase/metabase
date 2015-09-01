'use strict';

import Icon from "metabase/components/Icon.react";
import LoadingSpinner from 'metabase/components/LoadingSpinner.react';
import QueryVisualizationTable from './QueryVisualizationTable.react';
import QueryVisualizationChart from './QueryVisualizationChart.react';
import QueryVisualizationObjectDetailTable from './QueryVisualizationObjectDetailTable.react';
import RunButton from './RunButton.react';
import VisualizationSettings from './VisualizationSettings.react';

import Query from "metabase/lib/query";

import cx from "classnames";

export default React.createClass({
    displayName: 'QueryVisualization',
    propTypes: {
        visualizationSettingsApi: React.PropTypes.object.isRequired,
        card: React.PropTypes.object.isRequired,
        result: React.PropTypes.object,
        downloadLink: React.PropTypes.string,
        setDisplayFn: React.PropTypes.func.isRequired,
        setChartColorFn: React.PropTypes.func.isRequired,
        setSortFn: React.PropTypes.func.isRequired,
        cellIsClickableFn: React.PropTypes.func,
        cellClickedFn: React.PropTypes.func,
        isRunning: React.PropTypes.bool.isRequired,
        runQueryFn: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            // NOTE: this should be more dynamic from the backend, it's set based on the query lang
            maxTableRows: 2000
        };
    },

    getInitialState: function() {
        return {
            origQuery: JSON.stringify(this.props.card.dataset_query)
        };
    },

    componentWillReceiveProps: function(nextProps) {
        // whenever we are told that we are running a query lets update our understanding of the "current" query
        if (nextProps.isRunning) {
            this.setState({
                origQuery: JSON.stringify(nextProps.card.dataset_query)
            });
        }
    },

    queryIsDirty: function() {
        // a query is considered dirty if ANY part of it has been changed
        return (JSON.stringify(this.props.card.dataset_query) !== this.state.origQuery);
    },

    isChartDisplay: function(display) {
        return (display !== "table" && display !== "scalar");
    },

    runQuery: function() {
        this.props.runQueryFn(this.props.card.dataset_query);
    },

    canRun: function() {
        var query = this.props.card.dataset_query;
        if (query.query) {
            return Query.canRun(query.query);
        } else {
            return (query.database != undefined && query.native.query !== "");
        }
    },

    renderHeader: function() {
        var visualizationSettings = false;
        if (!this.props.isObjectDetail) {
            visualizationSettings = (<VisualizationSettings {...this.props}/>);
        }

        return (
            <div className="relative flex full mt3 mb1">
                {visualizationSettings}
                <div className="absolute left right ml-auto mr-auto layout-centered flex">
                    <RunButton
                        canRun={this.canRun()}
                        isDirty={this.queryIsDirty()}
                        isRunning={this.props.isRunning}
                        runFn={this.runQuery}
                    />
                </div>
                <div className="flex-align-right flex align-center">
                    {!this.queryIsDirty() && this.renderCount()}
                    {this.renderDownloadButton()}
                </div>
            </div>
        );
    },

    hasTooManyRows: function () {
        const dataset_query = this.props.card.dataset_query,
              rows = this.props.result.data.rows;

        if (this.props.result.data.rows_truncated ||
            (dataset_query.type === "query" &&
             dataset_query.query.aggregation[0] === "rows" &&
             rows.length === 2000))
        {
            return true;
        } else {
            return false;
        }
    },

    renderCount: function() {
        if (this.props.result && !this.props.isObjectDetail && this.props.card.display === "table") {
            return (
                <div>
                    { this.hasTooManyRows() ? ("Showing max of ") : ("Showing ")}
                    <b>{this.props.result.row_count}</b>
                    { (this.props.result.data.rows.length !== 1) ? (" rows") : (" row")}.
                </div>
            );
        }
    },

    renderDownloadButton: function() {
        // NOTE: we expect our component provider set this to something falsey if download not available
        if (this.props.downloadLink) {
            return (
                <a className="mx1" href={this.props.downloadLink} title="Download this data" target="_blank">
                    <Icon name='download' width="16px" height="16px" />
                </a>
            );
        }
    },

    render: function() {
        var loading,
            viz;

        if(this.props.isRunning) {
            loading = (
                <div className="Loading absolute top left bottom right flex flex-column layout-centered text-brand">
                    <LoadingSpinner />
                    <h2 className="Loading-message text-brand text-uppercase mt3">Doing science...</h2>
                </div>
            );
        }

        if (!this.props.result) {
            viz = (
                <div className="flex full layout-centered text-grey-1">
                    <h1>If you give me some data I can show you something cool.  Run a Query!</h1>
                </div>
            );
        } else {
            if (this.props.result.error) {
                viz = (
                    <div className="QueryError flex full align-center text-error">
                        <div className="QueryError-iconWrapper">
                            <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                                <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                            </svg>
                        </div>
                        <span className="QueryError-message">{this.props.result.error}</span>
                    </div>
                );

            } else if (this.props.result.data) {
                if (this.props.isObjectDetail) {
                    viz = (
                        <QueryVisualizationObjectDetailTable
                            data={this.props.result.data}
                            tableMetadata={this.props.tableMetadata}
                            tableForeignKeys={this.props.tableForeignKeys}
                            tableForeignKeyReferences={this.props.tableForeignKeyReferences}
                            cellIsClickableFn={this.props.cellIsClickableFn}
                            cellClickedFn={this.props.cellClickedFn}
                            followForeignKeyFn={this.props.followForeignKeyFn} />
                    );

                } else if (this.props.result.data.rows.length === 0) {
                    // successful query but there were 0 rows returned with the result
                    viz = (
                        <div className="QueryError flex full align-center text-brand">
                            <div className="QueryError-iconWrapper">
                                <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                                    <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                                </svg>
                            </div>
                            <span className="QueryError-message">Doh! We ran your query but it returned 0 rows of data.</span>
                        </div>
                    );

                } else if (this.props.card.display === "scalar") {
                    var scalarValue;
                    if (this.props.result.data.rows &&
                        this.props.result.data.rows.length > 0 &&
                        this.props.result.data.rows[0].length > 0) {
                        scalarValue = this.props.result.data.rows[0][0];
                    }

                    viz = (
                        <div className="Visualization--scalar flex full layout-centered">
                            <span>{scalarValue}</span>
                        </div>
                    );

                } else if (this.props.card.display === "table") {

                    var pivotTable = false,
                        cellClickable = this.props.cellIsClickableFn,
                        sortFunction = this.props.setSortFn,
                        sort = (this.props.card.dataset_query.query && this.props.card.dataset_query.query.order_by) ?
                                    this.props.card.dataset_query.query.order_by : null;

                    // check if the data is pivotable (2 groupings + 1 agg != 'rows')
                    if (Query.isStructured(this.props.card.dataset_query) &&
                            !Query.isBareRowsAggregation(this.props.card.dataset_query.query) &&
                            this.props.result.data.cols.length === 3) {
                        pivotTable = true;
                        sortFunction = undefined;
                        cellClickable = function() { return false; };
                    }

                    viz = (
                        <QueryVisualizationTable
                            data={this.props.result.data}
                            pivot={pivotTable}
                            maxRows={this.props.maxTableRows}
                            setSortFn={sortFunction}
                            sort={sort}
                            cellIsClickableFn={cellClickable}
                            cellClickedFn={this.props.cellClickedFn}
                        />
                    );

                } else {
                    // assume that anything not a table is a chart
                    viz = (
                        <QueryVisualizationChart
                            visualizationSettingsApi={this.props.visualizationSettingsApi}
                            card={this.props.card}
                            data={this.props.result.data} />
                    );
                }
            }
        }

        var wrapperClasses = cx({
            'wrapper': true,
            'full': true,
            'relative': true,
            'mb2': true,
            'flex': !this.props.isObjectDetail,
            'flex-column': !this.props.isObjectDetail
        });

        var visualizationClasses = cx({
            'flex': true,
            'flex-full': true,
            'Visualization': true,
            'Visualization--errors': (this.props.result && this.props.result.error),
            'Visualization--loading': this.props.isRunning,
        });

        return (
            <div className={wrapperClasses}>
                {this.renderHeader()}
                {loading}
                <div className={visualizationClasses}>
                    {viz}
                </div>
            </div>
        );
    }
});
