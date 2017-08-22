import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchMetrics, fetchDatabases } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata, getMetadataLoaded } from "metabase/selectors/metadata";

import type { Metric } from "metabase/meta/types/Metric";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

@connect(state => ({ metadata: getMetadata(state), metadataLoaded: getMetadataLoaded(state) }), { fetchMetrics, fetchDatabases })
export default class MetricSearch extends Component {
    props: {
        metadata: Metadata,
        metadataLoaded: any,
        fetchMetrics: () => void,
        fetchDatabases: () => void,
        onChooseMetric: (Metric) => void
    }

    componentDidMount() {
        this.props.fetchMetrics()
        this.props.fetchDatabases()
    }

    render() {
        const { metadataLoaded, metadata, onChooseMetric } = this.props;

        const isLoading = !metadataLoaded.metrics || !metadataLoaded.databases

        return (
            <LoadingAndErrorWrapper loading={isLoading}>
                {() =>
                    <EntitySearch
                        title="Which metric?"
                        entities={metadata.metricsList()}
                        chooseEntity={onChooseMetric}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

