import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";

import LoadingSpinner from 'metabase/components/LoadingSpinner.jsx';
import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";
import ShrinkableList from "metabase/components/ShrinkableList";

import RunButton from './RunButton.jsx';
import VisualizationSettings from './VisualizationSettings.jsx';

import VisualizationError from "./VisualizationError.jsx";
import VisualizationResult from "./VisualizationResult.jsx";

import Warnings from "./Warnings.jsx";
import QueryDownloadWidget from "./QueryDownloadWidget.jsx";
import QuestionEmbedWidget from "../containers/QuestionEmbedWidget";

import { formatNumber, inflect, duration } from "metabase/lib/formatting";
import Utils from "metabase/lib/utils";
import MetabaseSettings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";

import cx from "classnames";
import _ from "underscore";
import moment from "moment";

const REFRESH_TOOLTIP_THRESHOLD = 30 * 1000; // 30 seconds

export default class QueryVisualization extends Component {
    constructor(props, context) {
        super(props, context);
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
        cellIsClickableFn: PropTypes.func,
        cellClickedFn: PropTypes.func,
        isRunning: PropTypes.bool.isRequired,
        isRunnable: PropTypes.bool.isRequired,
        runQuery: PropTypes.func.isRequired,
        cancelQuery: PropTypes.func
    };

    static defaultProps = {
        // NOTE: this should be more dynamic from the backend, it's set based on the query lang
        maxTableRows: 2000
    };

    _getStateFromProps(props) {
        return {
            lastRunDatasetQuery: Utils.copy(props.card.dataset_query),
            lastRunParameterValues: Utils.copy(props.parameterValues)
        };
    }

    componentWillReceiveProps(nextProps) {
        // whenever we are told that we are running a query lets update our understanding of the "current" query
        if (nextProps.isRunning) {
            this.setState(this._getStateFromProps(nextProps));
        }
    }

    isChartDisplay(display) {
        return (display !== "table" && display !== "scalar");
    }

    runQuery = () => {
        this.props.runQuery(null, { ignoreCache: true });
    }

    renderHeader() {
        const { isObjectDetail, isRunnable, isRunning, isResultDirty, isAdmin, card, result, cancelQuery } = this.props;
        const isSaved = card.id != null;

        let runButtonTooltip;
        if (!isResultDirty && result && result.cached && result.average_execution_time > REFRESH_TOOLTIP_THRESHOLD) {
            runButtonTooltip = `This question will take approximately ${duration(result.average_execution_time)} to refresh`;
        }

        const messages = [];
        if (result && result.cached) {
            messages.push({
                icon: "clock",
                message: (
                    <div>
                        Updated {moment(result.updated_at).fromNow()}
                    </div>
                )
            })
        }
        if (result && result.data && !isObjectDetail && card.display === "table") {
            messages.push({
                icon: "table2",
                message: (
                    <div>
                        { result.data.rows_truncated != null ? ("Showing first ") : ("Showing ")}
                        <strong>{formatNumber(result.row_count)}</strong>
                        { " " + inflect("row", result.data.rows.length) }
                    </div>
                )
            })
        }

        const isPublicLinksEnabled = MetabaseSettings.get("public_sharing");
        const isEmbeddingEnabled = MetabaseSettings.get("embedding");
        return (
            <div className="relative flex align-center flex-no-shrink mt2 mb1 sm-py3">
                <div className="z4 absolute left hide sm-show">
                  { !isObjectDetail && <VisualizationSettings ref="settings" {...this.props} /> }
                </div>
                <div className="z3 absolute left right">
                    <Tooltip tooltip={runButtonTooltip}>
                        <RunButton
                            isRunnable={isRunnable}
                            isDirty={isResultDirty}
                            isRunning={isRunning}
                            onRun={this.runQuery}
                            onCancel={cancelQuery}
                        />
                    </Tooltip>
                </div>
                <div className="z4 absolute right flex align-center justify-end" style={{ lineHeight: 0 /* needed to align icons :-/ */ }}>
                    <ShrinkableList
                        className="flex"
                        items={messages}
                        renderItem={(item) =>
                            <div className="flex-no-shrink flex align-center mx2 h5 text-grey-4">
                                <Icon className="mr1" name={item.icon} size={12} />
                                {item.message}
                            </div>
                        }
                        renderItemSmall={(item) =>
                            <Tooltip tooltip={<div className="p1">{item.message}</div>}>
                                <Icon className="mx1" name={item.icon} size={16} />
                            </Tooltip>
                        }
                    />
                    { !isObjectDetail &&
                        <Warnings warnings={this.state.warnings} className="mx1" size={18} />
                    }
                    { !isResultDirty && result && !result.error ?
                        <QueryDownloadWidget
                            className="mx1 hide sm-show"
                            card={card}
                            result={result}
                        />
                    : null }
                    { isSaved && (
                        (isPublicLinksEnabled && (isAdmin || card.public_uuid)) ||
                        (isEmbeddingEnabled && isAdmin)
                    ) ?
                        <QuestionEmbedWidget
                            className="mx1 hide sm-show"
                            card={card}
                        />
                    : null }
                </div>
            </div>
        );
    }

    render() {
        const { className, card, databases, isObjectDetail, isRunning, result } = this.props
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
                        className="spread"
                    />
                );
            }
        }

        const wrapperClasses = cx(className, 'relative', {
            'flex': !isObjectDetail,
            'flex-column': !isObjectDetail
        });

        const visualizationClasses = cx('flex flex-full Visualization z1 relative', {
            'Visualization--errors': (result && result.error),
            'Visualization--loading': isRunning
        });

        return (
            <div className={wrapperClasses}>
                { !this.props.noHeader && this.renderHeader()}
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
        { showTutorialLink && <Link to={Urls.question(null, "?tutorial")} className="link cursor-pointer my2">How do I use this thing?</Link> }
    </div>
