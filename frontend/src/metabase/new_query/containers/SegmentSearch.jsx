/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchSegments } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata } from "metabase/selectors/metadata";

import type { Metric } from "metabase/meta/types/Metric";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import HeaderWithBack from "metabase/components/HeaderWithBack";

@connect(state => ({ metadata: getMetadata(state) }), { fetchSegments })
export default class SegmentSearch extends Component {
    props: {
        metadata: Metadata,
        fetchMetrics: () => void,
        onChooseSegment: (Metric) => void
    }

    componentDidMount() {
        this.props.fetchSegments(true)
    }

    render() {
        const segments = this.props.metadata.segmentsList()

        return (
            <LoadingAndErrorWrapper loading={!segments}>
                { () =>
                    <div className="wrapper pt4 pb1">
                        <HeaderWithBack name="Which segment?" />
                        <EntitySearch
                            entities={segments}
                            chooseEntity={this.props.onChooseSegment}
                        />
                    </div>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

