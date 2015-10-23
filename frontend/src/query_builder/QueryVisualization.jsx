import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import LoadingSpinner from 'metabase/components/LoadingSpinner.jsx';
import QueryVisualizationTable from './QueryVisualizationTable.jsx';
import QueryVisualizationChart from './QueryVisualizationChart.jsx';
import QueryVisualizationObjectDetailTable from './QueryVisualizationObjectDetailTable.jsx';
import RunButton from './RunButton.jsx';
import VisualizationSettings from './VisualizationSettings.jsx';

import MetabaseSettings from "metabase/lib/settings";
import Query from "metabase/lib/query";

import cx from "classnames";

export default class QueryVisualization extends Component {
    constructor(props, context) {
        super(props, context);
        this.runQuery = this.runQuery.bind(this);

        this.state = {
            origQuery: JSON.stringify(props.card.dataset_query)
        };
    }

    static propTypes = {
        visualizationSettingsApi: PropTypes.object.isRequired,
        card: PropTypes.object.isRequired,
        result: PropTypes.object,
        downloadLink: PropTypes.string,
        setDisplayFn: PropTypes.func.isRequired,
        setChartColorFn: PropTypes.func.isRequired,
        setSortFn: PropTypes.func.isRequired,
        cellIsClickableFn: PropTypes.func,
        cellClickedFn: PropTypes.func,
        isRunning: PropTypes.bool.isRequired,
        runQueryFn: PropTypes.func.isRequired
    };

    static defaultProps = {
        // NOTE: this should be more dynamic from the backend, it's set based on the query lang
        maxTableRows: 2000
    };

    componentWillReceiveProps(nextProps) {
        // whenever we are told that we are running a query lets update our understanding of the "current" query
        if (nextProps.isRunning) {
            this.setState({
                origQuery: JSON.stringify(nextProps.card.dataset_query)
            });
        }
    }

    queryIsDirty() {
        // a query is considered dirty if ANY part of it has been changed
        return (JSON.stringify(this.props.card.dataset_query) !== this.state.origQuery);
    }

    isChartDisplay(display) {
        return (display !== "table" && display !== "scalar");
    }

    runQuery() {
        this.props.runQueryFn();
    }

    canRun() {
        var query = this.props.card.dataset_query;
        if (query.query) {
            return Query.canRun(query.query);
        } else {
            return (query.database != undefined && query.native.query !== "");
        }
    }

    renderHeader() {
        var visualizationSettings = false;
        if (!this.props.isObjectDetail) {
            visualizationSettings = (<VisualizationSettings {...this.props}/>);
        }

        return (
            <div className="relative flex full mt3 mb1">
                <span className="relative z3">{visualizationSettings}</span>
                <div className="absolute flex layout-centered left right z2">
                    <RunButton
                        canRun={this.canRun()}
                        isDirty={this.queryIsDirty()}
                        isRunning={this.props.isRunning}
                        runFn={this.runQuery}
                    />
                </div>
                <div className="absolute right z3 flex align-center">
                    {!this.queryIsDirty() && this.renderCount()}
                    {this.renderDownloadButton()}
                </div>
            </div>
        );
    }

    hasTooManyRows() {
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
    }

    renderCount() {
        let { result, isObjectDetail, card } = this.props;
        if (result &&  result.data && !isObjectDetail && card.display === "table") {
            return (
                <div>
                    { this.hasTooManyRows() ? ("Showing max of ") : ("Showing ")}
                    <b>{result.row_count}</b>
                    { (result.data.rows.length !== 1) ? (" rows") : (" row")}.
                </div>
            );
        }
    }

    renderDownloadButton() {
        // NOTE: we expect our component provider set this to something falsey if download not available
        if (this.props.downloadLink) {
            if (window.OSX) {
                const downloadLink = this.props.downloadLink;
                return (
                    <a classname="mx1" href="#" title="Download this data" onClick={function() {
                        window.OSX.saveCSV(downloadLink);
                    }}>
                        <Icon name='download' width="16px" height="16px" />
                    </a>
                );
            } else {
                return (
                    <a className="mx1" href={this.props.downloadLink} title="Download this data" target="_blank">
                        <Icon name='download' width="16px" height="16px" />
                    </a>
                );
            }
        }
    }

    render() {
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
                    <h1>If you're stuck, you can always just pick a table and hit "Run Query" to get started.</h1>
                </div>
            );
        } else {
            let { result } = this.props;
            let error = result.error;
            if (error) {
                if (typeof error.status === "number") {
                    let adminEmail = MetabaseSettings.adminEmail();
                    // Assume if the request took more than 15 seconds it was due to a timeout
                    // Some platforms like Heroku return a 503 for numerous types of errors so we can't use the status code to distinguish between timeouts and other failures.
                    if (result.duration > 15*1000) {
                        viz = (
                            <div className="QueryError flex full align-center">
                                <div className="QueryError-image QueryError-image--timeout"></div>
                                <div className="QueryError-message text-centered">
                                    <h1 className="text-bold">Your question took too long</h1>
                                    <p className="QueryError-messageText">We didn't get an answer back from your database in time, so we had to stop. You can try again in a minute, or if the problem persists, you can email an admin to let them know.</p>
                                    {adminEmail && <span className="QueryError-adminEmail"><a className="no-decoration" href={"mailto:"+adminEmail}>{adminEmail}</a></span>}
                                </div>
                            </div>
                        );
                    } else {
                        viz = (
                            <div className="QueryError flex full align-center">
                                <div className="QueryError-image QueryError-image--serverError"></div>
                                <div className="QueryError-message text-centered">
                                    <h1 className="text-bold">We're experiencing server issues</h1>
                                    <p className="QueryError-messageText">Try refreshing the page after waiting a minute or two. If the problem persists we'd recommend you contact an admin.</p>
                                    {adminEmail && <span className="QueryError-adminEmail"><a className="no-decoration" href={"mailto:"+adminEmail}>{adminEmail}</a></span>}
                                </div>
                            </div>
                        );
                    }
                } else if (this.props.card.dataset_query && this.props.card.dataset_query.type === 'native') {
                    // always show errors for native queries
                    viz = (
                        <div className="QueryError flex full align-center text-error">
                            <div className="QueryError-iconWrapper">
                                <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                                    <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                                </svg>
                            </div>
                            <span className="QueryError-message">{error}</span>
                        </div>
                    );
                } else {
                    viz = (
                        <div className="QueryError flex full align-center">
                            <div className="QueryError-image QueryError-image--queryError"></div>
                            <div className="QueryError-message text-centered">
                                <h1 className="text-bold">We couldn't understand your question.</h1>
                                <p className="QueryError-messageText">Your question might contain an invalid parameter or some other error.</p>
                                <button className="Button" onClick={() => window.history.back() }>
                                    Back to last run
                                </button>
                            </div>
                        </div>
                    );
                }

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
                        <div className="QueryError flex full align-center">
                            <div className="QueryError-image QueryError-image--noRows"></div>
                            <div className="QueryError-message text-centered">
                                <h1 className="text-bold">No results!</h1>
                                <p className="QueryError-messageText">This may be the answer you’re looking for. If not, chances are your filters are too specific. Try removing or changing your filters to see more data.</p>
                                <button className="Button" onClick={() => window.history.back() }>
                                    Back to last run
                                </button>
                            </div>
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
}
