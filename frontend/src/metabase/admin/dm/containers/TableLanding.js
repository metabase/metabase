import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import {
    getTableById,
    getFieldsByTableId
} from 'metabase/selectors/metadata'

import { fetchTableMetadata } from 'metabase/redux/metadata'

class TableLanding extends Component {
    componentDidMount () {
        this.props.fetchTableMetadata(this.props.params.tableId)
    }
    render () {
        const { table, fields } = this.props
        return (
            <div>
                <h2>{ table && table.display_name }</h2>
                <ol>
                    { fields && fields.map(field =>
                        <li>
                            <DataModelFieldLink id={field.id}>
                                {field.display_name}
                            </DataModelFieldLink>
                        </li>
                    )}
                </ol>
            </div>
        )
    }
}

@withRouter
class DataModelFieldLink extends Component {
    render () {
        const { params, id, children } = this.props
        return (
            <Link to={`/admin/dm/database/${params.databaseId}/table/${params.tableId}/field/${id}`}>
                {children}
            </Link>
        )
    }
}

const mapStateToProps = (state, { params }) => ({
    table: getTableById(state, params.tableId),
    fields: getFieldsByTableId(state, params.tableId)
})

export default connect(
    mapStateToProps,
    { fetchTableMetadata }
)(TableLanding)
