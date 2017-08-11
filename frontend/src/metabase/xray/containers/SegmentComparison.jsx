import React, { Component } from 'react'
import { connect } from 'react-redux'
import _ from 'underscore'

import title from 'metabase/hoc/Title'

import { fetchSegmentComparison } from 'metabase/xray/xray'
import { getComparison } from 'metabase/xray/selectors'

import { normal } from 'metabase/lib/colors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import XRayComparison from 'metabase/xray/components/XRayComparison'

const mapStateToProps = state => ({
    comparison: getComparison(state)
})

const mapDispatchToProps = {
    fetchSegmentComparison
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({comparison}) =>
    comparison && (
        `${comparison.constituents[0].features.segment.name} / ${comparison.constituents[1].features.segment.name}`
    )
)
class SegmentComparison extends Component {

    componentWillMount () {
        const { cost, segmentId1, segmentId2 } = this.props.params
        this.props.fetchSegmentComparison(segmentId1, segmentId2, cost)
    }

    render () {
        const { params, comparison } = this.props
        return (
            <LoadingAndErrorWrapper
                loading={!comparison}
                noBackground
            >
                { () =>

                    <XRayComparison
                        cost={params.cost}
                        fields={
                            _.sortBy(Object.values(comparison.constituents[0].constituents).map(c =>
                                c.field
                            ), 'distance')
                        }
                        comparisonFields={[
                            'Difference',
                            'Entropy',
                            'Histogram',
                            'Uniqueness',
                            'Nil%',
                        ]}
                        comparison={comparison.comparison}
                        itemA={{
                            name: comparison.constituents[0].features.segment.name,
                            constituents: comparison.constituents[0].constituents,
                            itemType: 'segment',
                            color: normal.green,
                            id: comparison.constituents[0].features.segment.id,
                        }}
                        itemB={{
                            name: comparison.constituents[1].features.segment.name,
                            constituents: comparison.constituents[1].constituents,
                            itemType: 'segment',
                            color: normal.orange,
                            id: comparison.constituents[0].features.segment.id,
                        }}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default SegmentComparison
