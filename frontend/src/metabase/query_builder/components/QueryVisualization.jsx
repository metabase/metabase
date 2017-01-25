import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { Link } from "react-router";

import LoadingSpinner from 'metabase/components/LoadingSpinner.jsx';
import RunButton from './RunButton.jsx';
import VisualizationSettings from './VisualizationSettings.jsx';

import VisualizationError from "./VisualizationError.jsx";
import VisualizationResult from "./VisualizationResult.jsx";

import Warnings from "./Warnings.jsx";
import DownloadWidget from "./DownloadWidget.jsx";

import { formatNumber, inflect } from "metabase/lib/formatting";
import Utils from "metabase/lib/utils";

import cx from "classnames";
import _ from "underscore";

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
        onUpdateVisualizationSettings: PropTypes.func.isRequired,
        onReplaceAllVisualizationSettings: PropTypes.func.isRequired,
        setSortFn: PropTypes.func.isRequired,
        cellIsClickableFn: PropTypes.func,
        cellClickedFn: PropTypes.func,
        isRunning: PropTypes.bool.isRequired,
        isRunnable: PropTypes.bool.isRequired,
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
            !Utils.equals(this.props.card.dataset_query, this.state.lastRunDatasetQuery) ||
            !Utils.equals(this.props.parameterValues, this.state.lastRunParameterValues)
        );
    }

    isChartDisplay(display) {
        return (display !== "table" && display !== "scalar");
    }

    runQuery() {
        this.props.runQueryFn();
    }

    renderHeader() {
        const { isObjectDetail, isRunning, card, result } = this.props;
        return (
            <div className="relative flex flex-no-shrink mt3 mb1" style={{ minHeight: "2em" }}>
                <span className="relative z4">
                  { !isObjectDetail && <VisualizationSettings ref="settings" {...this.props} /> }
                </span>
                <div className="absolute flex layout-centered left right z3">
                    <RunButton
                        canRun={this.props.isRunnable}
                        isDirty={this.queryIsDirty()}
                        isRunning={isRunning}
                        runFn={this.runQuery}
                        cancelFn={this.props.cancelQueryFn}
                    />
                </div>
                <div className="absolute right z4 flex align-center" style={{ lineHeight: 0 /* needed to align icons :-/ */ }}>
                    { !this.queryIsDirty() && this.renderCount() }
                    { !isObjectDetail &&
                        <Warnings warnings={this.state.warnings} className="mx2" size={18} />
                    }
                    { !this.queryIsDirty() && result && !result.error ?
                        <DownloadWidget
                            className="mx1"
                            card={card}
                            datasetQuery={result.json_query}
                            isLarge={result.data.rows_truncated != null}
                        />
                    : null }
                </div>
            </div>
        );
    }

    renderCount() {
        let { result, isObjectDetail, card } = this.props;
        if (result && result.data && !isObjectDetail && card.display === "table") {
            return (
                <div>
                    { result.data.rows_truncated != null ? ("Showing first ") : ("Showing ")}
                    <b>{formatNumber(result.row_count)}</b>
                    { " " + inflect("row", result.data.rows.length) }.
                </div>
            );
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
                viz = (
                    <VisualizationResult
                        lastRunDatasetQuery={this.state.lastRunDatasetQuery}
                        onUpdateWarnings={(warnings) => this.setState({ warnings })}
                        onOpenChartSettings={() => this.refs.settings.open()}
                        {...this.props}
                    />
                );
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
