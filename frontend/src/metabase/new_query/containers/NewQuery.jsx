/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchDatabases, fetchTableMetadata } from 'metabase/redux/metadata'
import { resetQuery, updateQuery } from '../new_query'

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import Table from "metabase-lib/lib/metadata/Table";
import Database from "metabase-lib/lib/metadata/Database";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery"
import type { TableId } from "metabase/meta/types/Table";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { getMetadata } from "metabase/selectors/metadata";
import NewQueryOption from "metabase/new_query/components/NewQueryOption";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { getCurrentQuery, getPlainNativeQuery } from "metabase/new_query/selectors";
import Query from "metabase-lib/lib/queries/Query";
import MetricSearch from "metabase/new_query/containers/MetricSearch";
import Segment from "metabase-lib/lib/metadata/Segment";
import Metric from "metabase-lib/lib/metadata/Metric";
import SegmentSearch from "metabase/new_query/containers/SegmentSearch";

const mapStateToProps = state => ({
    query: getCurrentQuery(state),
    plainNativeQuery: getPlainNativeQuery(state),
    metadata: getMetadata(state)
})

const mapDispatchToProps = {
    fetchDatabases,
    fetchTableMetadata,
    resetQuery,
    updateQuery
}


type Props = {
    // Component parameters
    onComplete: (StructuredQuery) => void,
    onCurrentStepChanged?: () => void,
    defaultStep?: "start" | "metricSearch" | "segmentSearch",

    // Properties injected with redux connect
    query: StructuredQuery,
    plainNativeQuery: NativeQuery,

    resetQuery: () => void,
    updateQuery: (Query) => void,

    fetchDatabases: () => void,
    fetchTableMetadata: (TableId) => void,

    metadata: Metadata,
}

export class NewQuery extends Component {
    props: Props

    constructor(props, context) {
        super(props, context);
        this.state = {
            currentStep: props.defaultStep || "start"
        }
    }

    componentWillMount() {
        this.props.fetchDatabases();
        this.props.resetQuery();
    }

    startGuiQuery = (database: Database) => {
        this.props.onComplete(this.props.query);
    }

    startNativeQuery = (table: Table) => {
        this.props.onComplete(this.props.plainNativeQuery);
    }

    setCurrentStep = (step) => {
        if (this.props.onCurrentStepChanged) {
            // If onCurrentStepChanged is set, let it take the step change into effect
            this.props.onCurrentStepChanged(step);
        } else {
            // Otherwise just update the internal state of NewQuery
            this.setState({ currentStep: step })
        }
    }

    showMetricSearch = () => {
        this.setCurrentStep("metricSearch");
    }

    showSegmentSearch = () => {
        this.setCurrentStep("segmentSearch");
    }

    startMetricQuery = (metric: Metric) => {
        this.props.fetchTableMetadata(metric.table.id);

        const updatedQuery = this.props.query
            .setDatabase(metric.table.db)
            .setTable(metric.table)
            .addAggregation(metric.aggregationClause())

        this.props.onComplete(updatedQuery);
    }

    startSegmentQuery = (segment: Segment) => {
        this.props.fetchTableMetadata(segment.table.id);

        const updatedQuery = this.props.query
            .setDatabase(segment.table.database)
            .setTable(segment.table)
            .addFilter(segment.definition.filter)
        // how to set the segment ...?

        this.props.onComplete(updatedQuery);
    }

    render() {
        const { query } = this.props
        const { currentStep } = this.state;

        if (!query) {
            return <LoadingAndErrorWrapper loading={true}/>
        }

        if (currentStep === "metricSearch") {
            return (
                <MetricSearch onChooseMetric={this.startMetricQuery} />
            )
        } else if (currentStep === "segmentSearch") {
            return (
                <SegmentSearch onChooseSegment={this.startSegmentQuery} />
            )
        } else {
            return (
                <div className="bg-slate-extra-light full-height flex">
                    <div className="wrapper wrapper--trim lg-wrapper--trim xl-wrapper--trim flex-full px1 mt4 mb2 align-center">
                         <div className="full-height flex align-center justify-center">
                            <ol className="flex-full Grid Grid--guttersXl Grid--full small-Grid--1of2 large-Grid--normal">
                                <li className="Grid-cell">
                                    <NewQueryOption
                                        image="/app/img/questions_illustration"
                                        title="Metrics"
                                        description="See data over time, as a map, or pivoted to help you understand trends or changes."
                                        onClick={this.showMetricSearch}
                                    />
                                </li>
                                <li className="Grid-cell">
                                    <NewQueryOption
                                        image="/app/img/list_illustration"
                                        title="Segments"
                                        description="Explore tables and see what’s going on underneath your charts."
                                        width={180}
                                        onClick={this.showSegmentSearch}
                                    />
                                </li>
                                <li className="Grid-cell">
                                    {/*TODO: Move illustrations to the new location in file hierarchy. At the same time put an end to the equal-size-@2x ridicule. */}
                                    <NewQueryOption
                                        image="/app/img/custom_question"
                                        title="New question"
                                        description="Use the simple query builder to see trends, lists of things, or to create your own metrics."
                                        onClick={this.startGuiQuery}
                                    />
                                </li>
                                <li className="Grid-cell">
                                    <NewQueryOption
                                        image="/app/img/sql_illustration"
                                        title="SQL"
                                        description="For more complicated questions, you can write your own SQL."
                                        onClick={this.startNativeQuery}
                                    />
                                </li>
                            </ol>
                        </div>
                    </div>
                </div>
            )
        }
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(NewQuery)
