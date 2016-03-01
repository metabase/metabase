import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Icon from "metabase/components/Icon.jsx";
import LoadingSpinner from 'metabase/components/LoadingSpinner.jsx';
import QueryVisualizationObjectDetailTable from './QueryVisualizationObjectDetailTable.jsx';
import RunButton from './RunButton.jsx';
import VisualizationSettings from './VisualizationSettings.jsx';

import Visualization from "metabase/visualizations/components/Visualization.jsx";

import MetabaseSettings from "metabase/lib/settings";
import Modal from "metabase/components/Modal.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import Query from "metabase/lib/query";

import cx from "classnames";
import _ from "underscore";

export default class QueryVisualization extends Component {
    constructor(props, context) {
        super(props, context);
        this.runQuery = this.runQuery.bind(this);

        this.state = {
            lastRunDatasetQuery: props.card.dataset_query
        };
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        result: PropTypes.object,
        databases: PropTypes.array,
        tableMetadata: PropTypes.object,
        tableForeignKeys: PropTypes.array,
        tableForeignKeyReferences: PropTypes.object,
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
                lastRunDatasetQuery: nextProps.card.dataset_query
            });
        }
    }

    queryIsDirty() {
        // a query is considered dirty if ANY part of it has been changed
        return JSON.stringify(this.props.card.dataset_query) !== JSON.stringify(this.state.lastRunDatasetQuery);
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
            <div className="relative flex flex-no-shrink mt3 mb1">
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

    onDownloadCSV() {
        const form = this._downloadCsvForm.getDOMNode();
        form.query.value = JSON.stringify(this.props.card.dataset_query);
        form.submit();
    }

    renderDownloadButton() {
        const { card, result } = this.props;

        if (result && !result.error) {
            if (result && result.data && result.data.rows_truncated) {
                // this is a "large" dataset, so show a modal to inform users about this and make them click again to d/l
                let downloadButton;
                if (window.OSX) {
                    downloadButton = (<button className="Button Button--primary" onClick={() => {
                            window.OSX.saveCSV(JSON.stringify(card.dataset_query));
                            this.refs.downloadModal.toggle()
                        }}>Download CSV</button>);
                } else {
                    downloadButton = (
                        <form ref={(c) => this._downloadCsvForm = c} method="POST" action="/api/dataset/csv">
                            <input type="hidden" name="query" value="" />
                            <a className="Button Button--primary" onClick={() => {this.onDownloadCSV(); this.refs.downloadModal.toggle();}}>
                                Download CSV
                            </a>
                        </form>
                    );
                }

                return (
                    <ModalWithTrigger
                        key="download"
                        ref="downloadModal"
                        triggerElement={<Icon className="mx1" title="Download this data" name='download' width="16px" height="16px" />}
                    >
                        <Modal className="Modal Modal--small">
                            <div className="p4 text-centered relative">
                                <span className="absolute top right p4 text-normal text-grey-3 cursor-pointer" onClick={() => this.refs.downloadModal.toggle()}>
                                    <Icon name={'close'} width={16} height={16} />
                                </span>
                                <div className="p3 text-strong">
                                    <h2 className="text-bold">Download large data set</h2>
                                    <div className="pt2">Your answer has a large amount of data so we wanted to let you know it could take a while to download.</div>
                                    <div className="py4">The maximum download amount is 1 million rows.</div>
                                    {downloadButton}
                                </div>
                            </div>
                        </Modal>
                    </ModalWithTrigger>
                );
            } else {
                if (window.OSX) {
                    return (
                        <a className="mx1" title="Download this data" onClick={function() {
                            window.OSX.saveCSV(JSON.stringify(card.dataset_query));
                        }}>
                            <Icon name='download' width="16px" height="16px" />
                        </a>
                    );
                } else {
                    return (
                        <form ref={(c) => this._downloadCsvForm = c} method="POST" action="/api/dataset/csv">
                            <input type="hidden" name="query" value="" />
                            <a className="mx1" title="Download this data" onClick={() => this.onDownloadCSV()}>
                                <Icon name='download' width="16px" height="16px" />
                            </a>
                        </form>
                    );
                }
            }
        }
    }

    showDetailError() {
        if (this._detailErrorLink && this._detailErrorBody ) {
            ReactDOM.findDOMNode(this._detailErrorLink).style.display = "none";
            ReactDOM.findDOMNode(this._detailErrorBody).style.display = "inherit";
        }
    }

    render() {
        var loading,
            viz;

        if(this.props.isRunning) {
            loading = (
                <div className="Loading absolute top left bottom right flex flex-column layout-centered text-brand z2">
                    <LoadingSpinner />
                    <h2 className="Loading-message text-brand text-uppercase mt3">Doing science...</h2>
                </div>
            );
        }

        if (!this.props.result) {
            let hasSampleDataset = !!_.findWhere(this.props.databases, { is_sample: true });
            viz = (
                <div className="flex full layout-centered text-grey-1 flex-column">
                    <h1>If you give me some data I can show you something cool. Run a Query!</h1>
                    { hasSampleDataset && <a className="link cursor-pointer my2" href="/q?tutorial">How do I use this thing?</a> }
                </div>
            );
        } else {
            let { result } = this.props;
            let error = result.error;
            let adminEmail = MetabaseSettings.adminEmail();
            if (error) {
                if (typeof error.status === "number") {
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
                        <div className="QueryError2 flex full justify-center">
                            <div className="QueryError-image QueryError-image--queryError mr4"></div>
                            <div className="QueryError2-details">
                                <h1 className="text-bold">There was a problem with your question</h1>
                                <p className="QueryError-messageText">Most of the time this is caused by an invalid selection or bad input value.  Double check your inputs and retry your query.</p>
                                <div ref={(c) => this._detailErrorLink = c} className="pt2">
                                    <a onClick={this.showDetailError.bind(this)} className="link cursor-pointer">Show error details</a>
                                </div>
                                <div ref={(c) => this._detailErrorBody = c} style={{display: "none"}} className="pt3 text-left">
                                    <h2>Here's the full error message</h2>
                                    <div style={{fontFamily: "monospace"}} className="QueryError2-detailBody bordered rounded bg-grey-0 text-bold p2 mt1">{error}</div>
                                </div>
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

                } else {
                    // we want to provide the visualization with a card containing the latest
                    // "display", "visualization_settings", etc, (to ensure the correct visualization is shown)
                    // BUT the last executed "dataset_query" (to ensure data matches the query)
                    let card = {
                        ...this.props.card,
                        dataset_query: this.state.lastRunDatasetQuery
                    };
                    viz = (
                        <Visualization
                            className="full"
                            series={[{ card: card, data: this.props.result.data }]}
                            // Table:
                            setSortFn={this.props.setSortFn}
                            cellIsClickableFn={this.props.cellIsClickableFn}
                            cellClickedFn={this.props.cellClickedFn}
                        />
                    );
                }
            }
        }

        var wrapperClasses = cx('wrapper full relative mb2 z1', {
            'flex': !this.props.isObjectDetail,
            'flex-column': !this.props.isObjectDetail
        });

        var visualizationClasses = cx('flex flex-full Visualization z1 px1', {
            'Visualization--errors': (this.props.result && this.props.result.error),
            'Visualization--loading': this.props.isRunning
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
