import React, { Component } from 'react'
import { connect } from 'react-redux'

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
            <div>
                <div className="py4">
                    <h1>{ table && table.display_name}</h1>
                </div>
                <div className="border-bottom mb2 flex align-center">
                    <h4 className="mb2 mr2">Fields</h4>
                    <h4 className="mb2">Segments</h4>
                </div>
                <ol className="text-measure">
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
            </div>
        )
    }
}

const mapStateToProps = (state, { params }) => ({
    table: getTableById(state, params.tableId),
})

export default withBreadcrumbs(
    connect(mapStateToProps,{ fetchTableMetadata })(TableLanding)
)
