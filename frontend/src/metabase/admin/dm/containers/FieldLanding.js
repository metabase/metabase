import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from 'react-router'

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
                <div className="py4">
                    <h1>{ field && field.display_name }</h1>
                </div>
                <ol className="flex align-center border-bottom mb2 py2">
                    <li className="mr2"><Link><h4>Display</h4></Link></li>
                    <li><Link><h4>Binning</h4></Link></li>
                </ol>
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
