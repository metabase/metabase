import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import { getTableById, } from 'metabase/selectors/metadata'
import { fetchTableMetadata } from 'metabase/redux/metadata'

import DataModelFieldLink from './DataModelFieldLink'

import withBreadcrumbs from './WithBreadcrumbs'

import ColumnItem from 'metabase/admin/datamodel/components/database/ColumnItem'

class TableLanding extends Component {
    componentDidMount () {
        this.props.fetchTableMetadata(this.props.params.tableId)
    }
    render () {
        const { table } = this.props
        return (
            <ol>
                { table && table.fields && table.fields.map(field =>
                    <li>
                        <ColumnItem field={field} />
                        <DataModelFieldLink id={field.id}>
                            <div>
                                {field.display_name}
                            </div>
                        </DataModelFieldLink>
                    </li>
                )}
            </ol>
        )
    }
}

const mapStateToProps = (state, { params }) => ({
    table: getTableById(state, params.tableId),
})

export default withBreadcrumbs(
    connect(mapStateToProps,{ fetchTableMetadata })(TableLanding)
)
