import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchSegmentComparison } from 'metabase/reference/reference'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

const mapStateToProps = state => ({
    segmentComparison: state.reference.segmentComparison
})

const mapDispatchToProps = {
    fetchSegmentComparison
}

class SegmentComparison extends Component {
    componentWillMount () {
        const { segmentId1, segmentId2 } = this.props.params
        console.log('ids', segmentId1, segmentId2)
        this.props.fetchSegmentComparison(segmentId1, segmentId2)
    }
    render () {
        return (
            <LoadingAndErrorWrapper loading={!this.props.segmentComparison}>
                { JSON.stringify(this.props.segmentComparison, null, 2) }
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(SegmentComparison)
