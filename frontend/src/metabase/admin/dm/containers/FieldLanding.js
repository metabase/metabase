import React, { Component } from 'react'
import { connect } from 'react-redux'

import { getField } from 'metabase/selectors/metadata'
import { fetchTableMetadata } from 'metabase/redux/metadata'

import withBreadcrumbs from './WithBreadcrumbs'

class FieldLanding extends Component {
    componentDidMount () {
        this.props.fetchTableMetadata(this.props.params.tableId)
    }
    render () {
        const { field } = this.props
        return (
            <div>
                <h2>{ field && field.display_name }</h2>
            </div>
        )
    }
}

const mapStateToProps = (state, { params }) => ({
    field: getField(state, params.fieldId)
})

export default withBreadcrumbs(
    connect(mapStateToProps,{ fetchTableMetadata })(FieldLanding)
)
