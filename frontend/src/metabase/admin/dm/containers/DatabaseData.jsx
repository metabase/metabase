import React, { Component } from 'react'
import { connect } from 'react-redux'

import { Link, withRouter } from 'react-router'

import { getTablesByDatabaseId } from 'metabase/selectors/metadata'


class DatabaseData extends Component {
    render () {
        return <TableList tables={this.props.tables} />
    }
}

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

const TableList = ({ tables }) =>
    <ol>
        { tables && tables.map(table =>
            <li key={table.id}>
                <DataModelTableLink id={table.id}>
                    {table.display_name}
                </DataModelTableLink>
            </li>
        )}
    </ol>

const mapStateToProps = (state, props) => ({
    tables: getTablesByDatabaseId(state, props.params.databaseId)
})

export default connect(mapStateToProps)(DatabaseData)
