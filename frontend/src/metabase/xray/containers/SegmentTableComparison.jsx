import React, { Component } from 'react'
import { connect } from 'react-redux'
import _ from 'underscore'

import title from 'metabase/hoc/Title'

import { fetchSegmentTableComparison } from 'metabase/xray/xray'
import {
    getComparison,
    getComparisonFields,
    getSegmentItem,
    getTableItem,
    getTitle
} from 'metabase/xray/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import XRayComparison from 'metabase/xray/components/XRayComparison'

const mapStateToProps = state => ({
    comparison: getComparison(state),
    fields: getComparisonFields(state),
    itemA: getSegmentItem(state),
    itemB: getTableItem(state)
})

const mapDispatchToProps = {
    fetchSegmentTableComparison
}

@connect(mapStateToProps, mapDispatchToProps)
@title(props => getTitle(props))
class SegmentTableComparison extends Component {

    state = {
        error: null
    }

    async componentWillMount () {
        const { cost, segmentId, tableId } = this.props.params
        try {
            await this.props.fetchSegmentTableComparison(segmentId, tableId, cost)
        } catch (error) {
            this.setState({ error })
        }
    }

    render () {
        const { params, fields, comparison, itemA, itemB } = this.props
        const { error } = this.state
        return (
            <LoadingAndErrorWrapper
                loading={!comparison}
                error={error}
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
                        itemA={itemA}
                        itemB={itemB}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default SegmentTableComparison
