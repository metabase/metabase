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
        this.props.fetchDatabases() // load databases if not loaded yet
        this.props.fetchSegments(true) // metrics may change more often so always reload them
    }

    render() {
        const { metadataFetched, metadata, onChooseSegment } = this.props;

        const isLoading = !metadataFetched.segments || !metadataFetched.databases

        return (
            <LoadingAndErrorWrapper loading={isLoading}>
                {() =>
                    <EntitySearch
                        title="Which segment?"
                        // TODO Atte Keinänen 8/22/17: If you call `/api/table/:id/table_metadata` it returns
                        // all segments (also retired ones) and they are missing both `is_active` and `creator` props. Currently this
                        // filters them out but we should definitely update the endpoints in the upcoming metadata API refactoring.
                        entities={metadata.segmentsList().filter((segment) => segment.isActive())}
                        chooseEntity={onChooseSegment}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

