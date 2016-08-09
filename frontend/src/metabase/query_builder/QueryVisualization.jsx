import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";
import LoadingSpinner from 'metabase/components/LoadingSpinner.jsx';
import RunButton from './RunButton.jsx';
import VisualizationSettings from './VisualizationSettings.jsx';

import VisualizationError from "./VisualizationError.jsx";
import VisualizationResult from "./VisualizationResult.jsx";

import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import Query from "metabase/lib/query";

import cx from "classnames";
import _ from "underscore";

const isEqualsDeep = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default class QueryVisualization extends Component {
    constructor(props, context) {
        super(props, context);
        this.runQuery = this.runQuery.bind(this);

        this.state = this._getStateFromProps(props);
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        result: PropTypes.object,
        databases: PropTypes.array,
        tableMetadata: PropTypes.object,
        tableForeignKeys: PropTypes.array,
        tableForeignKeyReferences: PropTypes.object,
        setDisplayFn: PropTypes.func.isRequired,
        onUpdateVisualizationSetting: PropTypes.func.isRequired,
        onUpdateVisualizationSettings: PropTypes.func.isRequired,
        setSortFn: PropTypes.func.isRequired,
        cellIsClickableFn: PropTypes.func,
        cellClickedFn: PropTypes.func,
        isRunning: PropTypes.bool.isRequired,
        runQueryFn: PropTypes.func.isRequired,
        cancelQueryFn: PropTypes.func
    };

    static defaultProps = {
        // NOTE: this should be more dynamic from the backend, it's set based on the query lang
        maxTableRows: 2000
    };

    _getStateFromProps(props) {
        return {
            lastRunDatasetQuery: JSON.parse(JSON.stringify(props.card.dataset_query)),
            lastRunParameterValues: JSON.parse(JSON.stringify(props.parameterValues))
        };
    }

    componentWillReceiveProps(nextProps) {
        // whenever we are told that we are running a query lets update our understanding of the "current" query
        if (nextProps.isRunning) {
            this.setState(this._getStateFromProps(nextProps));
        }
    }

    queryIsDirty() {
        // a query is considered dirty if ANY part of it has been changed
        return (
            !isEqualsDeep(this.props.card.dataset_query, this.state.lastRunDatasetQuery) ||
            !isEqualsDeep(this.props.parameterValues, this.state.lastRunParameterValues)
        );
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
        const { isObjectDetail, isRunning } = this.props;
        return (
            <div className="relative flex flex-no-shrink mt3 mb1" style={{ minHeight: "2em" }}>
                <span className="relative z4">
                  { !isObjectDetail && <VisualizationSettings {...this.props}/> }
                </span>
                <div className="absolute flex layout-centered left right z3">
                    <RunButton
                        canRun={this.canRun()}
                        isDirty={this.queryIsDirty()}
                        isRunning={isRunning}
                        runFn={this.runQuery}
                        cancelFn={this.props.cancelQueryFn}
                    />
                </div>
                <div className="absolute right z4 flex align-center">
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
        const form = ReactDOM.findDOMNode(this._downloadCsvForm);
        form.query.value = JSON.stringify(this.props.fullDatasetQuery);
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
                        className="Modal Modal--small"
                        triggerElement={<Icon className="mx1" title="Download this data" name='download' size={16} />}
                    >
                        <div style={{width: "480px"}} className="Modal--small p4 text-centered relative">
                            <span className="absolute top right p4 text-normal text-grey-3 cursor-pointer" onClick={() => this.refs.downloadModal.toggle()}>
                                <Icon name={'close'} size={16} />
                            </span>
                            <div className="p3 text-strong">
                                <h2 className="text-bold">Download large data set</h2>
                                <div className="pt2">Your answer has a large amount of data so we wanted to let you know it could take a while to download.</div>
                                <div className="py4">The maximum download amount is 1 million rows.</div>
                                {downloadButton}
                            </div>
                        </div>
                    </ModalWithTrigger>
                );
            } else {
                if (window.OSX) {
                    return (
                        <a className="mx1" title="Download this data" onClick={function() {
                            window.OSX.saveCSV(JSON.stringify(card.dataset_query));
                        }}>
                            <Icon name='download' size={16} />
                        </a>
                    );
                } else {
                    return (
                        <form ref={(c) => this._downloadCsvForm = c} method="POST" action="/api/dataset/csv">
                            <input type="hidden" name="query" value="" />
                            <a className="mx1" title="Download this data" onClick={() => this.onDownloadCSV()}>
                                <Icon name='download' size={16} />
                            </a>
                        </form>
                    );
                }
            }
        }
    }


    render() {
        const { card, databases, isObjectDetail, isRunning, result } = this.props
        let viz;

        if (!result) {
            let hasSampleDataset = !!_.findWhere(databases, { is_sample: true });
            viz = <VisualizationEmptyState showTutorialLink={hasSampleDataset} />
        } else {
            let error = result.error;

            if (error) {
                viz = <VisualizationError error={error} card={card} duration={result.duration} />
            } else if (result.data) {
                viz = <VisualizationResult lastRunDatasetQuery={this.state.lastRunDatasetQuery} {...this.props} />
            }
        }

        const wrapperClasses = cx('wrapper full relative mb2 z1', {
            'flex': !isObjectDetail,
            'flex-column': !isObjectDetail
        });

        const visualizationClasses = cx('flex flex-full Visualization z1 px1', {
            'Visualization--errors': (result && result.error),
            'Visualization--loading': isRunning
        });

        return (
            <div className={wrapperClasses}>
                {this.renderHeader()}
                { isRunning && (
                    <div className="Loading spread flex flex-column layout-centered text-brand z2">
                        <LoadingSpinner />
                        <h2 className="Loading-message text-brand text-uppercase my3">Doing science...</h2>
                    </div>
                )}
                <div className={visualizationClasses}>
                    {viz}
                </div>
            </div>
        );
    }
}

const VisualizationEmptyState = ({showTutorialLink}) =>
    <div className="flex full layout-centered text-grey-1 flex-column">
        <h1>If you give me some data I can show you something cool. Run a Query!</h1>
        { showTutorialLink && <Link to="/q?tutorial" className="link cursor-pointer my2">How do I use this thing?</Link> }
    </div>
