/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchDatabases, fetchSegments } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata, getMetadataLoaded } from "metabase/selectors/metadata";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import type { Segment } from "metabase/meta/types/Segment";

@connect(state => ({ metadata: getMetadata(state), metadataLoaded: getMetadataLoaded(state) }), { fetchSegments, fetchDatabases })
export default class SegmentSearch extends Component {
    props: {
        metadata: Metadata,
        metadataLoaded: any,
        fetchSegments: () => void,
        fetchDatabases: () => void,
        onChooseSegment: (Segment) => void
    }

    componentDidMount() {
        this.props.fetchSegments()
        this.props.fetchDatabases()
    }

    render() {
        const { metadataLoaded, metadata, onChooseSegment } = this.props;

        const isLoading = !metadataLoaded.segments || !metadataLoaded.databases

        return (
            <LoadingAndErrorWrapper loading={isLoading}>
                {() =>
                    <EntitySearch
                        title="Which segment?"
                        entities={metadata.segmentsList()}
                        chooseEntity={onChooseSegment}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

