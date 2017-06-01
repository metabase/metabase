import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import cx from "classnames";
import _ from "underscore";

import { duration } from "metabase/lib/formatting";
import MetabaseSettings from "metabase/lib/settings";

import QueryModeButton from "metabase/query_builder/components/QueryModeButton";
import ButtonBar from "metabase/components/ButtonBar";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";
import RunButton from "metabase/query_builder/components/RunButton";
import Tooltip from "metabase/components/Tooltip";
import MetricList from "metabase/query_builder/components/MetricList";
import {REFRESH_TOOLTIP_THRESHOLD} from "metabase/query_builder/components/QueryVisualization";

import type { TableId } from "metabase/meta/types/Table";
import type { DatabaseId } from "metabase/meta/types/Database";
import type { DatasetQuery } from "metabase/meta/types/Card";
import type { TableMetadata, DatabaseMetadata } from "metabase/meta/types/Metadata";
import type { Children } from 'react';
import QueryWrapper from "metabase-lib/lib/Query";

type Props = {
    children?: Children,

    features: {
        data?: boolean,
        filter?: boolean,
        aggregation?: boolean,
        breakout?: boolean,
        sort?: boolean,
        limit?: boolean
    },

    query: QueryWrapper,

    databases: DatabaseMetadata[],
    tables: TableMetadata[],

    supportMultipleAggregations?: boolean,

    setDatabaseFn: (id: DatabaseId) => void,
    setSourceTableFn: (id: TableId) => void,
    setDatasetQuery: (datasetQuery: DatasetQuery) => void,

    isShowingTutorial: boolean,
    isShowingDataReference: boolean,
}

type State = {
    expanded: boolean
}

export default class CardEditor extends Component {
    props: Props;
    state: State = {
        expanded: true
    };

    static propTypes = {
        databases: PropTypes.array,
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
        const { features, question } = this.props;

        if (!features.aggregation && !features.breakout) {
            return;
        }

        // TODO Atte Keinänen 5/25/17 How should `isEditable` work for multimetric questions?
        if (question.query().isEditable()) {
            return <MetricList {...this.props} />
        } else {
            // TODO: move this into AggregationWidget?
            return (
                <div className="Query-section Query-section-aggregation disabled">
                    <a className="QueryOption p1 flex align-center"></a>
                </div>
            );
        }
    }

    renderButtons = () => {
        // NOTE: Most of stuff is replicated from QueryVisualization header
        const { question, isResultDirty, isAdmin, result, setQueryModeFn, tableMetadata, isRunnable, isRunning, runQuery, cancelQuery } = this.props;

        const isPublicLinksEnabled = MetabaseSettings.get("public_sharing");
        const isEmbeddingEnabled = MetabaseSettings.get("embedding");

        const getQueryModeButton = () =>
            <QueryModeButton
                key="queryModeToggle"
                mode={question.datasetQuery().type}
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
                card={question.card()}
                result={result}
            />;

        const getQueryEmbedWidget = () =>
            <QuestionEmbedWidget key="questionembed" className="hide sm-show" card={question.card()} />;

        const getRunButton = () => {
            const { question, originalQuestion } = this.props;
            const runQueryByIgnoringCache = () => runQuery(question.card(), { originalCard: originalQuestion && originalQuestion.card(), ignoreCache: true });

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
        const isEmbeddable = question.isSaved() && (
                (isPublicLinksEnabled && (isAdmin || question.card().public_uuid)) ||
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
