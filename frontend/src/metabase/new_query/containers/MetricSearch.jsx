/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchMetrics } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata } from "metabase/selectors/metadata";

import type { Metric } from "metabase/meta/types/Metric";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import HeaderWithBack from "metabase/components/HeaderWithBack";

@connect(state => ({ metadata: getMetadata(state) }), { fetchMetrics })
export default class MetricSearch extends Component {
    props: {
        metadata: Metadata,
        fetchMetrics: () => void,
        onChooseMetric: (Metric) => void
    }

    componentDidMount() {
        this.props.fetchMetrics(true)
    }

    render() {
        const metrics = this.props.metadata.metricsList()

        return (
            <LoadingAndErrorWrapper loading={!metrics}>
                { () =>
                    <div className="wrapper pt4 pb1">
                        <HeaderWithBack name="Which metric?" />
                        <EntitySearch
                            entities={metrics}
                            chooseEntity={this.props.onChooseMetric}
                        />
                    </div>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

