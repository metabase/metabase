import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchTableComparison } from 'metabase/reference/reference'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

const mapStateToProps = state => ({
    tableComparison: state.reference.tableComparison
})

const mapDispatchToProps = {
    fetchTableComparison
}

class TableComparison extends Component {
    componentWillMount () {
        const { tableId1, tableId2 } = this.props.params
        console.log('ids', tableId1, tableId2)
        this.props.fetchTableComparison(tableId1, tableId2)
    }
    render () {
        return (
            <LoadingAndErrorWrapper loading={!this.props.tableComparison}>
                { JSON.stringify(this.props.tableComparison, null, 2) }
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(TableComparison)
