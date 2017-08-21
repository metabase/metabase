import React, { Component } from 'react'
import { connect } from 'react-redux'

import title from 'metabase/hoc/Title'
import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

import XRayFieldComparison from 'metabase/xray/components/XrayFieldComparison'

import {
    getComparison,
    getSegmentItem,
    getTableItem,
    getTitle,
} from 'metabase/xray/selectors'

import {
    fetchSegmentTableFieldComparison
} from 'metabase/xray/xray'

const mapStateToProps = (state) => ({
    comparison: getComparison(state),
    itemA: getSegmentItem(state),
    itemB: getTableItem(state),
})

const mapDispatchToProps = {
    fetchSegmentTableFieldComparison
}

@connect(mapStateToProps, mapDispatchToProps)
@title(props => getTitle(props))
class SegmentFieldComparison extends Component {
    componentWillMount () {
        const { fetchSegmentTableFieldComparison, params } = this.props

        const {
            segmentId,
            tableId,
            fieldName,
            cost
        } = params

        if(tableId) {
            fetchSegmentTableFieldComparison({
                segmentId,
                tableId,
                fieldName,
                cost
            })
        }
    }
    render () {
        const { comparison, itemA, itemB, field, params } = this.props
        return (
            <LoadingAndErrorWrapper loading={!comparison}>
                { () =>
                    <XRayFieldComparison
                        itemA={itemA}
                        itemB={itemB}
                        field={field}
                        cost={params.cost}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default SegmentFieldComparison
