import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchMetrics, fetchDatabases } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata, getMetadataFetched } from "metabase/selectors/metadata";
import _ from 'underscore'

import type { Metric } from "metabase/meta/types/Metric";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import EmptyState from "metabase/components/EmptyState";

const mapStateToProps = state => ({
    metadata: getMetadata(state),
    metadataFetched: getMetadataFetched(state)
})
const mapDispatchToProps = {
    fetchMetrics,
    fetchDatabases,
}

@connect(mapStateToProps, mapDispatchToProps)
export default class MetricSearch extends Component {
    props: {
        metadata: Metadata,
        metadataFetched: any,
        fetchMetrics: () => void,
        fetchDatabases: () => void,
        onChooseMetric: (Metric) => void
    }

    componentDidMount() {
        this.props.fetchDatabases() // load databases if not loaded yet
        this.props.fetchMetrics(true) // metrics may change more often so always reload them
    }

    render() {
        const { metadataFetched, metadata, onChooseMetric } = this.props;

        const isLoading = !metadataFetched.metrics || !metadataFetched.databases

        return (
            <LoadingAndErrorWrapper loading={isLoading}>
                {() => {
                    const sortedActiveMetrics = _.chain(metadata.metricsList())
                        .filter((metric) => metric.isActive())
                        .sortBy(({name}) => name.toLowerCase())
                        .value()

                    if (sortedActiveMetrics.length > 0) {
                        return <EntitySearch
                            title="Which metric?"
                            // TODO Atte Keinänen 8/22/17: If you call `/api/table/:id/table_metadata` it returns
                            // all metrics (also retired ones) and is missing `is_active` prop. Currently this
                            // filters them out but we should definitely update the endpoints in the upcoming metadata API refactoring.
                            entities={sortedActiveMetrics}
                            chooseEntity={onChooseMetric}
                        />
                    } else {
                        return (
                            <div className="mt2 flex-full flex align-center justify-center bg-slate-extra-light">
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

