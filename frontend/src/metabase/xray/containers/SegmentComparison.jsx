import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchSegmentComparison } from 'metabase/xray/xray'
import { getComparison } from 'metabase/xray/selectors'

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
        this.props.fetchSegmentTableComparison(segmentId1, segmentId2)
    }

    render () {
        return <XRayComparison comparison={this.props.comparison} />
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(SegmentComparison)
