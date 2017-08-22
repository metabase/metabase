import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchMetrics, fetchDatabases } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata, getMetadataFetched } from "metabase/selectors/metadata";

import type { Metric } from "metabase/meta/types/Metric";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

@connect(state => ({ metadata: getMetadata(state), metadataFetched: getMetadataFetched(state) }), { fetchMetrics, fetchDatabases })
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
                {() =>
                    <EntitySearch
                        title="Which metric?"
                        // TODO Atte Keinänen 8/22/17: If you call `/api/table/:id/table_metadata` it returns
                        // all metrics (also retired ones) and is missing `is_active` prop. Currently this
                        // filters them out but we should definitely update the endpoints in the upcoming metadata API refactoring.
                        entities={metadata.metricsList().filter((metric) => metric.isActive())}
                        chooseEntity={onChooseMetric}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

