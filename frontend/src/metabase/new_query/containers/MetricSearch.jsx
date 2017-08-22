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
        this.props.fetchMetrics()
        this.props.fetchDatabases()
    }

    render() {
        const { metadataFetched, metadata, onChooseMetric } = this.props;

        const isLoading = !metadataFetched.metrics || !metadataFetched.databases

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

