import React, { Component } from 'react'
import { Link, withRouter } from 'react-router'

@withRouter
class DataModelTableLink extends Component {
    render () {
        const { params, id, children } = this.props
        return (
            <Link to={`/admin/dm/database/${params.databaseId}/table/${id}/`}>
                {children}
            </Link>
        )
    }
}

export default DataModelTableLink

