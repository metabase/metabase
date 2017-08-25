import React, { Component } from 'react'
import { connect } from 'react-redux'

import {
    fetchDatabases,
    fetchMetrics,
    fetchSegments,
} from 'metabase/redux/metadata'

import { resetQuery } from '../new_query'

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery"
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { getMetadata, getMetadataFetched } from "metabase/selectors/metadata";
import NewQueryOption from "metabase/new_query/components/NewQueryOption";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { getCurrentQuery, getPlainNativeQuery } from "metabase/new_query/selectors";
import { getUserIsAdmin } from "metabase/selectors/user";

const mapStateToProps = state => ({
    query: getCurrentQuery(state),
    plainNativeQuery: getPlainNativeQuery(state),
    metadata: getMetadata(state),
    metadataFetched: getMetadataFetched(state),
    isAdmin: getUserIsAdmin(state)
})

const mapDispatchToProps = {
    fetchDatabases,
    fetchMetrics,
    fetchSegments,
    resetQuery
}

type Props = {
    // Component parameters
    getUrlForQuery: (StructuredQuery) => void,
    metricSearchUrl: string,
    segmentSearchUrl: string,

    // Properties injected with redux connect
    query: StructuredQuery,
    plainNativeQuery: NativeQuery,
    metadata: Metadata,
    isAdmin: boolean,

    resetQuery: () => void,

    fetchDatabases: () => void,
    fetchMetrics: () => void,
    fetchSegments: () => void,
}

export class NewQueryOptions extends Component {
    props: Props

    componentWillMount() {
        this.props.fetchDatabases()
        this.props.fetchMetrics()
        this.props.fetchSegments()

        this.props.resetQuery();
    }

    getGuiQueryUrl = () => {
        return this.props.getUrlForQuery(this.props.query);
    }

    getNativeQueryUrl = () => {
        return this.props.getUrlForQuery(this.props.plainNativeQuery);
    }

    render() {
        const { query, metadata, metadataFetched, isAdmin, metricSearchUrl, segmentSearchUrl } = this.props

        if (!query || (!isAdmin && (!metadataFetched.metrics || !metadataFetched.segments))) {
            return <LoadingAndErrorWrapper loading={true}/>
        }

        const showMetricOption = isAdmin || metadata.metricsList().length > 0
        const showSegmentOption = isAdmin || metadata.segmentsList().length > 0
        const showCustomInsteadOfNewQuestionText = showMetricOption || showSegmentOption

        return (
            <div className="bg-slate-extra-light full-height flex">
                <div className="wrapper wrapper--trim lg-wrapper--trim xl-wrapper--trim flex-full px1 mt4 mb2 align-center">
                     <div className="flex align-center justify-center" style={{minHeight: "100%"}}>
                        <ol className="flex-full Grid Grid--guttersXl Grid--full small-Grid--1of2 large-Grid--normal">
                            { showMetricOption &&
                                <li className="Grid-cell">
                                    <NewQueryOption
                                        image="/app/img/questions_illustration"
                                        title="Metrics"
                                        description="See data over time, as a map, or pivoted to help you understand trends or changes."
                                        to={metricSearchUrl}
                                    />
                                </li>
                            }
                            { showSegmentOption &&
                                <li className="Grid-cell">
                                    <NewQueryOption
                                        image="/app/img/list_illustration"
                                        title="Segments"
                                        description="Explore tables and see what’s going on underneath your charts."
                                        width={180}
                                        to={segmentSearchUrl}
                                    />
                                </li>
                            }
                            <li className="Grid-cell">
                                {/*TODO: Move illustrations to the new location in file hierarchy. At the same time put an end to the equal-size-@2x ridicule. */}
                                <NewQueryOption
                                    image="/app/img/query_builder_illustration"
                                    title={ showCustomInsteadOfNewQuestionText ? "Custom" : "New question"}
                                    description="Use the simple query builder to see trends, lists of things, or to create your own metrics."
                                    width={180}
                                    to={this.getGuiQueryUrl}
                                />
                            </li>
                            <li className="Grid-cell">
                                <NewQueryOption
                                    image="/app/img/sql_illustration"
                                    title="SQL"
                                    description="For more complicated questions, you can write your own SQL."
                                    to={this.getNativeQueryUrl}
                                />
                            </li>
                        </ol>
                    </div>
                </div>
            </div>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(NewQueryOptions)
