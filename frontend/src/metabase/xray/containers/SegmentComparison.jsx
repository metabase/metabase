import React, { Component } from 'react'
import { connect } from 'react-redux'
import _ from 'underscore'

import title from 'metabase/hoc/Title'

import { fetchSegmentComparison, initialize } from 'metabase/xray/xray'
import {
    getComparison,
    getComparisonFields,
    getComparisonContributors,
    getSegmentItem,
    getTitle,
    getLoadingStatus,
    getError
} from 'metabase/xray/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import XRayComparison from 'metabase/xray/components/XRayComparison'
import LoadingAnimation from 'metabase/xray/components/LoadingAnimation'

import { hasComparison, comparisonLoadingMessages } from 'metabase/xray/utils'

const mapStateToProps = (state) => ({
    comparison:     getComparison(state),
    fields:         getComparisonFields(state),
    contributors:   getComparisonContributors(state),
    itemA:          getSegmentItem(state, 0),
    itemB:          getSegmentItem(state, 1),
    isLoading:      getLoadingStatus(state),
    error:          getError(state)
})

const mapDispatchToProps = {
    initialize,
    fetchSegmentComparison
}

@connect(mapStateToProps, mapDispatchToProps)
@title(props => getTitle(props))
class SegmentComparison extends Component {

    componentWillMount () {
        const { cost, segmentId1, segmentId2 } = this.props.params
        this.props.initialize()
        this.props.fetchSegmentComparison(segmentId1, segmentId2, cost)
    }

    componentWillUnmount() {
        // HACK Atte Keinänen 9/20/17: We need this for now because the structure of `state.xray.xray` isn't same
        // for all xray types and if switching to different kind of xray (= rendering different React container)
        // without resetting the state fails because `state.xray.xray` subproperty lookups fail
        this.props.initialize();
    }

    render () {
        const {
            comparison,
            contributors,
            error,
            fields,
            isLoading,
            itemA,
            itemB,
            params,
        } = this.props

        return (
            <LoadingAndErrorWrapper
                loading={isLoading || !hasComparison(comparison)}
                error={error}
                noBackground
                loadingMessages={comparisonLoadingMessages}
                loadingScenes={[<LoadingAnimation />]}
            >
                { () =>

                    <XRayComparison
                        cost={params.cost}
                        fields={_.sortBy(fields, 'distance').reverse()}
                        comparisonFields={[
                            'Difference',
                            'Entropy',
                            'Histogram',
                            'Nil%',
                        ]}
                        contributors={contributors}
                        comparison={comparison.comparison}
                        itemA={itemA}
                        itemB={itemB}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default SegmentComparison
