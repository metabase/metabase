import React, { Component } from 'react'
import { connect } from 'react-redux'
import _ from 'underscore'

import title from 'metabase/hoc/Title'

import { fetchSegmentTableComparison } from 'metabase/xray/xray'
import { getComparison, getComparisonFields } from 'metabase/xray/selectors'

import { normal } from 'metabase/lib/colors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import XRayComparison from 'metabase/xray/components/XRayComparison'

const mapStateToProps = state => ({
    comparison: getComparison(state),
    fields: getComparisonFields(state)
})

const mapDispatchToProps = {
    fetchSegmentTableComparison
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({comparison}) =>
    comparison && (
        `${comparison.constituents[0].features.segment.name} / ${comparison.constituents[1].features.table.display_name}`
    )
)

class SegmentTableComparison extends Component {
    componentWillMount () {
        const { cost, segmentId, tableId } = this.props.params
        this.props.fetchSegmentTableComparison(segmentId, tableId, cost)
    }

    render () {
        const { params, fields, comparison } = this.props
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

export default SegmentTableComparison
