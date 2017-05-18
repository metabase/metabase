import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import MetricWidget from "metabase/query_builder/components/MetricWidget";
import { duration } from "metabase/lib/formatting";

import Query from "metabase/lib/query";
import MetabaseSettings from "metabase/lib/settings";

import cx from "classnames";
import _ from "underscore";
import AddButton from "metabase/components/AddButton";
import QueryModeButton from "metabase/query_builder/components/QueryModeButton";
import ButtonBar from "metabase/components/ButtonBar";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";
import {REFRESH_TOOLTIP_THRESHOLD} from "metabase/query_builder/components/QueryVisualization";
import RunButton from "metabase/query_builder/components/RunButton";
import Tooltip from "metabase/components/Tooltip";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import AddMetricModal from "metabase/query_builder/components/AddMetricModal";
import {getCardColors} from "metabase/visualizations/lib/utils";

export default class CardEditor extends Component {
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
        features: PropTypes.object,
        supportMultipleAggregations: PropTypes.bool
    };

    static defaultProps = {
        features: {
            data: true,
            filter: true,
            aggregation: true,
            breakout: true,
            sort: true,
            limit: true
        },
        supportMultipleAggregations: true
    };

    renderMetricSection() {
        const { card, features, datasetQuery: { query }, tableMetadata, supportMultipleAggregations } = this.props;

        if (!features.aggregation && !features.breakout) {
            return;
        }

        if (!this.props.features.aggregation) {
            return;
        }

        // aggregation clause.  must have table details available
        if (tableMetadata) {
            const metricColors = getCardColors(card);

            let isBareRows = Query.isBareRows(query);
            let aggregations = Query.getAggregations(query);

            if (aggregations.length === 0) {
                // add implicit rows aggregation
                aggregations.push(["rows"]);
            }

            const canRemoveAggregation = aggregations.length > 1;

            let aggregationList = [];
            for (const [index, aggregation] of aggregations.entries()) {
                aggregationList.push(
                    <MetricWidget
                        key={"agg"+index}
                        aggregation={aggregation}
                        tableMetadata={tableMetadata}
                        customFields={Query.getExpressions(this.props.datasetQuery.query)}
                        updateAggregation={(aggregation) => this.props.updateQueryAggregation(index, aggregation)}
                        removeAggregation={canRemoveAggregation ? this.props.removeQueryAggregation.bind(null, index) : null}
                        addMetric={() => {}}
                        clearable
                        color={metricColors[index]}
                    />
                );
            }

            if (supportMultipleAggregations && !isBareRows) {
                const canAddMetricToVisualization = _.contains(["line", "area", "bar"], this.props.card.display);

                aggregationList.push(
                    <ModalWithTrigger
                        full
                        disabled={!canAddMetricToVisualization}
                        triggerElement={
                            <Tooltip
                                key="addmetric"
                                tooltip={canAddMetricToVisualization ? "Add metric" : "In proto you can only add metrics to line/area/bar visualizations"}
                            >
                                <AddButton />
                            </Tooltip>
                        }
                    >
                        <AddMetricModal tableMetadata={tableMetadata}/>
                    </ModalWithTrigger>
                );
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

    renderButtons = () => {
        // NOTE: Most of stuff is replicated from QueryVisualization header
        const { isResultDirty, isAdmin, card, result, setQueryModeFn, tableMetadata, isRunnable, isRunning, runQuery, cancelQuery } = this.props;

        const isSaved = card.id != null;
        const isPublicLinksEnabled = MetabaseSettings.get("public_sharing");
        const isEmbeddingEnabled = MetabaseSettings.get("embedding");

        const getQueryModeButton = () =>
            <QueryModeButton
                key="queryModeToggle"
                mode={card.dataset_query.type}
                allowNativeToQuery={false}
                allowQueryToNative={false}
                /*allowNativeToQuery={isNew && !isDirty}
                allowQueryToNative={tableMetadata ?
                    // if a table is selected, only enable if user has native write permissions for THAT database
                    tableMetadata.db && tableMetadata.db.native_permissions === "write" :
                    // if no table is selected, only enable if user has native write permissions for ANY database
                    _.any(databases, (db) => db.native_permissions === "write")
                }*/
                nativeForm={result && result.data && result.data.native_form}
                onSetMode={setQueryModeFn}
                tableMetadata={tableMetadata}
            />;

        const getQueryDownloadWidget = () =>
            <QueryDownloadWidget
                key="querydownload"
                className="hide sm-show"
                card={card}
                result={result}
            />;

        const getQueryEmbedWidget = () =>
            <QuestionEmbedWidget key="questionembed" className="hide sm-show" card={card} />;

        const getRunButton = () => {
            const runQueryByIgnoringCache = () => runQuery(null, { ignoreCache: true });

            let runButtonTooltip;
            if (!isResultDirty && result && result.cached && result.average_execution_time > REFRESH_TOOLTIP_THRESHOLD) {
                runButtonTooltip = `This question will take approximately ${duration(result.average_execution_time)} to refresh`;
            }

            return (
                <Tooltip key="runbutton" tooltip={runButtonTooltip}>
                    <RunButton
                        isRunnable={isRunnable}
                        isDirty={isResultDirty}
                        isRunning={isRunning}
                        onRun={runQueryByIgnoringCache}
                        onCancel={cancelQuery}
                    />
                </Tooltip>
            )
        }


        const queryHasCleanResult  = !isResultDirty && result && !result.error;
        const isEmbeddable = isSaved && (
                (isPublicLinksEnabled && (isAdmin || card.public_uuid)) ||
                (isEmbeddingEnabled && isAdmin)
        );

        const buttons = [
            getQueryModeButton(),
            isEmbeddable && getQueryEmbedWidget(),
            queryHasCleanResult && getQueryDownloadWidget(),
            getRunButton()
        ].filter(_.isObject);

        return (
            <ButtonBar buttons={buttons.map(b => [b])} className="borderless pr1 mr2" />
        );
    };

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
            <div className={cx("GuiBuilder rounded shadowed flex", {
                "GuiBuilder--expand": this.state.expanded,
                disabled: readOnly
            })} ref="guiBuilder">
                <div className="GuiBuilder-section flex-full flex align-center px2" ref="viewSection">
                    {this.renderMetricSection()}
                </div>
                <div className="GuiBuilder-section flex align-center justify-end">
                    {this.renderButtons()}
                </div>
                {/*<div className="GuiBuilder-row flex">
                 {this.renderDataSection()}
                 {this.renderFilterSection()}
                 </div>
                 <div className="GuiBuilder-row flex flex-full">
                 {this.renderMetricSection()}
                 {this.renderGroupedBySection()}
                 <div className="flex-full"></div>
                 {this.props.children}
                 <ExtendedOptions
                 {...this.props}
                 />
                 </div>*/}
            </div>
        );
    }
}
