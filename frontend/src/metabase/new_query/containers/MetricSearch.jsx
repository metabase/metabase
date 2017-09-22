import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchMetrics, fetchDatabasesWithMetadata } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata, getMetadataFetched } from "metabase/selectors/metadata";
import _ from 'underscore'

import type { Metric } from "metabase/meta/types/Metric";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import EmptyState from "metabase/components/EmptyState";

import type { StructuredQuery } from "metabase/meta/types/Query";
import { getCurrentQuery } from "metabase/new_query/selectors";
import { resetQuery } from '../new_query'

const mapStateToProps = state => ({
    query: getCurrentQuery(state),
    metadata: getMetadata(state),
    metadataFetched: getMetadataFetched(state)
})
const mapDispatchToProps = {
    fetchMetrics,
    fetchDatabasesWithMetadata,
    resetQuery
}

@connect(mapStateToProps, mapDispatchToProps)
export default class MetricSearch extends Component {
    props: {
        getUrlForQuery: (StructuredQuery) => void,
        backButtonUrl: string,

        query: StructuredQuery,
        metadata: Metadata,
        metadataFetched: any,
        fetchMetrics: () => void,
        fetchDatabases: () => void,
        resetQuery: () => void,
    }

    componentDidMount() {
        // load metadata for all tables for the automatic application of a filter;
        // THIS IS EXPERIMENTAL AND PROBABLY TOO HEAVY APPROACH FOR PRODUCTION!
        this.props.fetchDatabasesWithMetadata()
        this.props.fetchMetrics(true) // metrics may change more often so always reload them
        this.props.resetQuery();

    }

    getQueryForMetric = (metric: Metric) => {
        const queryWithoutFilter = this.props.query
            .setDatabase(metric.table.db)
            .setTable(metric.table)
            .addAggregation(metric.aggregationClause())

        const dateField = metric.table.fields.find((field) => field.isDate())

        if (dateField) {
            const dateFilter = ["time-interval", dateField.dimension().mbql(), -365, "day"]
            return queryWithoutFilter.addFilter(dateFilter).addBreakout(dateField.getDefaultBreakout())
        } else {
            return queryWithoutFilter;
        }
    }

    getUrlForMetric = (metric: Metric) => {
        return this.props.getUrlForQuery(this.getQueryForMetric(metric))
    }

    render() {
        const { backButtonUrl, metadataFetched, metadata } = this.props;
        const isLoading = !metadataFetched.metrics || !metadataFetched.databases

        return (
            <LoadingAndErrorWrapper loading={isLoading}>
                {() => {
                    const sortedActiveMetrics = _.chain(metadata.metricsList())
                        // Metric shouldn't be retired and it should refer to an existing table
                        .filter((metric) => metric.isActive() && metric.table)
                        .sortBy(({name}) => name.toLowerCase())
                        .value()

                    if (sortedActiveMetrics.length > 0) {
                        return (
                            <EntitySearch
                                title="Which metric?"
                                // TODO Atte Keinänen 8/22/17: If you call `/api/table/:id/table_metadata` it returns
                                // all metrics (also retired ones) and is missing `is_active` prop. Currently this
                                // filters them out but we should definitely update the endpoints in the upcoming metadata API refactoring.
                                entities={sortedActiveMetrics}
                                getUrlForEntity={this.getUrlForMetric}
                                backButtonUrl={backButtonUrl}
                            />
                        )
                    } else {
                        return (
                            <div className="mt2 flex-full flex align-center justify-center">
                                <EmptyState
                                    message={<span>Defining common metrics for your team makes it even easier to ask questions</span>}
                                    image="/app/img/metrics_illustration"
                                    action="How to create metrics"
                                    link="http://www.metabase.com/docs/latest/administration-guide/07-segments-and-metrics.html"
                                    className="mt2"
                                    imageClassName="mln2"
                                />
                            </div>
                        )
                    }
                }}
            </LoadingAndErrorWrapper>
        )
    }
}

