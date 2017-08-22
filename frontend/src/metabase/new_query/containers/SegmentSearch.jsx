/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'
import { fetchDatabases, fetchSegments } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata, getMetadataFetched } from "metabase/selectors/metadata";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import type { Segment } from "metabase/meta/types/Segment";

@connect(state => ({ metadata: getMetadata(state), metadataFetched: getMetadataFetched(state) }), { fetchSegments, fetchDatabases })
export default class SegmentSearch extends Component {
    props: {
        metadata: Metadata,
        metadataFetched: any,
        fetchSegments: () => void,
        fetchDatabases: () => void,
        onChooseSegment: (Segment) => void
    }

    componentDidMount() {
        this.props.fetchSegments()
        this.props.fetchDatabases()
    }

    render() {
        const { metadataFetched, metadata, onChooseSegment } = this.props;

        const isLoading = !metadataFetched.segments || !metadataFetched.databases

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

