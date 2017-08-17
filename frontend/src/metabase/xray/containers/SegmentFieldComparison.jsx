import React, { Component } from 'react'
import { connect } from 'react-redux'

import title from 'metabase/hoc/Title'
import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'
import ItemLink from 'metabase/xray/components/ItemLink'

import {
    getComparison,
    getSegmentItem,
    getTableItem,
    getTitle,
} from 'metabase/xray/selectors'

import { fetchSegmentTableFieldComparison } from 'metabase/xray/xray'

const mapStateToProps = (state) => ({
    comparison: getComparison(state),
    itemA: getSegmentItem(state),
    itemB: getTableItem(state),
})

const mapDispatchToProps = {
    fetchSegmentTableFieldComparison
}

const XRayFieldComparison = ({ itemA, itemB }) =>
    <div className="flex">
        <ItemLink
            item={itemA}
            link=''
        />
        <ItemLink
            item={itemB}
            link=''
        />
    </div>

@connect(mapStateToProps, mapDispatchToProps)
@title(props => getTitle(props))
class SegmentFieldComparison extends Component {
    componentWillMount () {
        const { fetchSegmentTableFieldComparison, params } = this.props
        const { segmentId, tableId, fieldName, cost } = params

        fetchSegmentTableFieldComparison({
            segmentId,
            tableId,
            fieldName,
            cost
        })
    }
    render () {
        const { comparison, itemA, itemB, field } = this.props
        return (
            <LoadingAndErrorWrapper loading={!comparison}>
                { () =>
                    <XRayPageWrapper>
                        <h1>
                            Comparing FIELD
                        </h1>
                        <XRayFieldComparison
                            itemA={itemA}
                            itemB={itemB}
                            field={field}
                        />
                    </XRayPageWrapper>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default SegmentFieldComparison
