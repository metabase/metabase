import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchSegmentTableComparison } from 'metabase/xray/xray'
import { getComparison } from 'metabase/xray/selectors'

import XRayComparison from 'metabase/xray/components/XRayComparison'

const mapStateToProps = state => ({
    comparison: getComparison(state)
})

const mapDispatchToProps = {
    fetchSegmentTableComparison
}

class SegmentTableComparison extends Component {
    componentWillMount () {
        const { segmentId, tableId } = this.props.params
        this.props.fetchSegmentTableComparison(segmentId, tableId)
    }

    render () {
        return (
            <XRayComparison
                comparison={this.props.comparison}
            />
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(SegmentTableComparison)
