import React, { Component } from 'react'
import { Link, withRouter } from 'react-router'

@withRouter
class DataModelTableLink extends Component {
    render () {
        const { params, id, children, style, activeStyle } = this.props
        return (
            <Link
                style={style}
                activeStyle={activeStyle}
                to={`/admin/dm/database/${params.databaseId}/table/${id}/`}
            >
                {children}
            </Link>
        )
    }
}

export default DataModelTableLink

