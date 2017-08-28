import React, { Component } from 'react'
import { connect } from 'react-redux'
import _ from 'underscore'

import title from 'metabase/hoc/Title'

import { fetchSegmentComparison } from 'metabase/xray/xray'
import {
    getComparison,
    getComparisonFields,
    getComparisonContributors,
    getSegmentItem,
    getTitle
} from 'metabase/xray/selectors'


import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import XRayComparison from 'metabase/xray/components/XRayComparison'

const mapStateToProps = (state) => ({
        comparison: getComparison(state),
        fields: getComparisonFields(state),
        contributors: getComparisonContributors(state),
        itemA: getSegmentItem(state, 0),
        itemB: getSegmentItem(state, 1)
})

const mapDispatchToProps = {
    fetchSegmentComparison
}

@connect(mapStateToProps, mapDispatchToProps)
@title(props => getTitle(props))
class SegmentComparison extends Component {

    componentWillMount () {
        const { cost, segmentId1, segmentId2 } = this.props.params
        this.props.fetchSegmentComparison(segmentId1, segmentId2, cost)
    }

    render () {
        const {
            contributors,
            params,
            comparison,
            fields,
            itemA,
            itemB
        } = this.props

        return (
            <LoadingAndErrorWrapper
                loading={!comparison}
                noBackground
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
