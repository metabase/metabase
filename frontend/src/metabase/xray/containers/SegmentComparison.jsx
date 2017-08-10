import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchSegmentComparison } from 'metabase/xray/xray'
import { getComparison } from 'metabase/xray/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import XRayComparison from 'metabase/xray/components/XRayComparison'

const mapStateToProps = state => ({
    comparison: getComparison(state)
})

const mapDispatchToProps = {
    fetchSegmentComparison
}

class SegmentComparison extends Component {
    componentWillMount () {
        const { segmentId1, segmentId2 } = this.props.params
        this.props.fetchSegmentComparison(segmentId1, segmentId2)
    }

    render () {
        const { comparison } = this.props
        return (
            <LoadingAndErrorWrapper
                loading={!comparison}
                noBackground
            >
                { () =>

                    <XRayComparison
                        fields={
                            Object.values(comparison.constituents[0].constituents).map(c =>
                                c.field
                            )
                        }
                        comparisonFields={[
                            'distance',
                            'threshold',
                            'entropy',
                            'count',
                            'histogram',
                            'uniqueness',
                            'nil%',
                        ]}
                        comparison={comparison.comparison}
                        itemA={{
                            name: comparison.constituents[0].features.segment.name,
                            constituents: comparison.constituents[0].constituents,
                            itemType: 'segment',
                            id: comparison.constituents[0].features.segment.id,
                        }}
                        itemB={{
                            name: comparison.constituents[1].features.segment.name,
                            constituents: comparison.constituents[1].constituents,
                            itemType: 'segment',
                            id: comparison.constituents[0].features.segment.id,
                        }}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(SegmentComparison)
