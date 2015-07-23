'use strict';

import { CardRenderer } from '../card/card.charting';
import QueryVisualizationTable from './visualization_table.react';
import QueryVisualizationChart from './visualization_chart.react';
import QueryVisualizationObjectDetailTable from './visualization_object_detail_table.react';
import RunButton from './run_button.react';
import VisualizationSettings from './visualization_settings.react';

import Query from './query';

var cx = React.addons.classSet;
var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'QueryVisualization',
    propTypes: {
        visualizationSettingsApi: React.PropTypes.object.isRequired,
        card: React.PropTypes.object.isRequired,
        result: React.PropTypes.object,
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
        return (
            <div className="flex mt3">
                <div className="flex-full">
                    <VisualizationSettings {...this.props}/>
                </div>
                <div className="flex align-center">
                    <RunButton
                        canRun={this.canRun()}
                        isDirty={this.queryIsDirty()}
                        isRunning={this.props.isRunning}
                        runFn={this.runQuery}
                    />
                </div>
                <div className="flex-full"></div>
            </div>
        );
    },

    renderFooter: function(tableFootnote) {
        if (this.props.isObjectDetail) {
            // no footer on object detail
            return false;
        } else {
            return (
                <div className="VisualizationFooter wrapper flex">
                    {tableFootnote}
                </div>
            );
        }
    },

    loader: function() {
        var animate = '<animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="0.8s" repeatCount="indefinite" />';
        return (
            <div className="Loading-indicator">
                <svg viewBox="0 0 32 32" width="32px" height="32px" fill="currentcolor">
                  <path opacity=".25" d="M16 0 A16 16 0 0 0 16 32 A16 16 0 0 0 16 0 M16 4 A12 12 0 0 1 16 28 A12 12 0 0 1 16 4"/>
                  <path d="M16 0 A16 16 0 0 1 32 16 L28 16 A12 12 0 0 0 16 4z" dangerouslySetInnerHTML={{__html: animate}}></path>
                </svg>
            </div>
        );
    },

    render: function() {
        var loading,
            viz,
            tableFootnote;

        if(this.props.isRunning) {
            loading = (
                <div className="Loading absolute top left bottom right flex flex-column layout-centered text-brand">
                    {this.loader()}
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
                    // when we are displaying a data grid, setup a footnote which provides some row information
                    if (this.props.result.data.rows_truncated ||
                            (this.props.card.dataset_query.type === "query" &&
                                this.props.card.dataset_query.query.aggregation[0] === "rows" &&
                                this.props.result.data.rows.length === 2000)) {
                        tableFootnote = (
                            <div className="flex-align-right mt1">
                                <span className="Badge Badge--headsUp mr2">Too many rows!</span>
                                Result data was capped at <b>{this.props.result.row_count}</b> rows.
                            </div>
                        );
                    } else {
                        tableFootnote = (
                            <div className="flex-align-right mt1">
                                Showing <b>{this.props.result.row_count}</b> rows.
                            </div>
                        );
                    }

                    var sort = (this.props.card.dataset_query.query && this.props.card.dataset_query.query.order_by) ?
                                    this.props.card.dataset_query.query.order_by : null;
                    viz = (
                        <QueryVisualizationTable
                            data={this.props.result.data}
                            maxRows={this.props.maxTableRows}
                            setSortFn={this.props.setSortFn}
                            sort={sort}
                            cellIsClickableFn={this.props.cellIsClickableFn}
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

                // check if the query result was truncated and let the user know about it if so
                if (this.props.result.data.rows_truncated && !tableFootnote) {
                    tableFootnote = (
                        <div className="mt1">
                            <span className="Badge Badge--headsUp mr2">Too many rows!</span>
                            Result data was capped at <b>{this.props.result.data.rows_truncated}</b> rows.
                        </div>
                    );
                }
            }
        }

        var wrapperClasses = cx({
            'wrapper': true,
            'full': true,
            'relative': true,
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
                {this.renderFooter(tableFootnote)}
                {loading}
                <div className={visualizationClasses}>
                    {viz}
                </div>
            </div>
        );
    }
});
