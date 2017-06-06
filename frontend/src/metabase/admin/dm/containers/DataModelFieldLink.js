import React, { Component } from 'react'
import { Link, withRouter } from 'react-router'

@withRouter
class DataModelFieldLink extends Component {
    render () {
        const { params, id, children } = this.props
        return (
            <Link
                to={`/admin/dm/database/${params.databaseId}/table/${params.tableId}/field/${id}/`}
                style={{ textDecoration: 'none' }}
            >
                {children}
            </Link>
        )
    }
}

export default DataModelFieldLink
