import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchFieldComparison } from 'metabase/xray/xray'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

const mapStateToProps = state => ({
    fieldComparison: state.xray.fieldComparison
})

const mapDispatchToProps = {
    fetchFieldComparison
}

class FieldComparison extends Component {
    componentWillMount () {
        const { fieldId1, fieldId2 } = this.props.params
        this.props.fetchFieldComparison(fieldId1, fieldId2)
    }
    render () {
        return (
            <LoadingAndErrorWrapper loading={!this.props.fieldComparison}>
                { JSON.stringify(this.props.fieldComparison, null, 2) }
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(FieldComparison)
