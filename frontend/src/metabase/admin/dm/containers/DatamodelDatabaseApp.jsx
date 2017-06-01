import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from 'react-router'

import { getDatabasesList } from 'metabase/selectors/metadata'

class DatamodelDatabaseApp extends Component {
    render () {
        return <DatabaseList databases={this.props.databases} />
    }
}

const DatabaseList = ({ databases }) =>
    <ol>
        {databases.map(database =>
            <Link to={`/admin/dm/database/${database.id}`}>
                {database.name}
            </Link>
        )}
    </ol>

export default connect(
    state => ({
       databases: getDatabasesList(state)
    })
)(DatamodelDatabaseApp)

