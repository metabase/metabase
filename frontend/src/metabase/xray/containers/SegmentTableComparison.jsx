import React, { Component } from 'react'
import { connect } from 'react-redux'

import TableLikeComparison from "metabase/xray/containers/TableLikeComparison";
import title from 'metabase/hoc/Title'

import { fetchSegmentTableComparison } from 'metabase/xray/xray'
import { getTitle } from 'metabase/xray/selectors'

const mapDispatchToProps = {
    fetchSegmentTableComparison
}

@connect(null, mapDispatchToProps)
@title(props => getTitle(props))
class SegmentTableComparison extends Component {
    render () {
        const { cost, segmentId, tableId } = this.props.params

        return (
            <TableLikeComparison
                cost={cost}
                fetchTableLikeComparison={
                    () => this.props.fetchSegmentTableComparison(segmentId, tableId, cost)
                }
            />
        )
    }
}

export default SegmentTableComparison
