import React, { Component } from 'react'
import { connect } from 'react-redux'
import _ from 'underscore'

import { fetchSegmentTableComparison } from 'metabase/xray/xray'
import { getComparison } from 'metabase/xray/selectors'

import { normal } from 'metabase/lib/colors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import XRayComparison from 'metabase/xray/components/XRayComparison'

const mapStateToProps = state => ({
    comparison: getComparison(state)
})

const mapDispatchToProps = {
    fetchSegmentTableComparison
}

class SegmentTableComparison extends Component {
    componentWillMount () {
        const { cost, segmentId, tableId } = this.props.params
        this.props.fetchSegmentTableComparison(segmentId, tableId, cost)
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
                            'Distance',
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
                            name: comparison.constituents[1].features.table.display_name,
                            constituents: comparison.constituents[1].constituents,
                            itemType: 'table',
                            color: normal.orange,
                            id: comparison.constituents[0].features.table.id,
                        }}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(SegmentTableComparison)
