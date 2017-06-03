import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link, withRouter } from 'react-router'

import {
    getDatabaseById,
    getTableById,
    getFieldById,
} from 'metabase/selectors/metadata'

import { datamodel } from 'metabase/lib/urls'

import DataModelTableLink from './DataModelTableLink'
import DataModelFieldLink from './DataModelFieldLink'

import Icon from 'metabase/components/Icon'

class BreadcrumbNav extends Component {
    render () {
        const { database, table, field } = this.props
        return (
            <ol className="flex align-center">
                { !database && (
                    <li>Your data</li>
                )}
                { database && (
                    <li className="mr1">
                        <Link to={datamodel.db(database.id)}>
                            { database.name }
                        </Link>
                        { table && <Icon name="chevronright" size={8} /> }
                    </li>
                )}
                { table && [
                    <li className="mr1 flex align-center">
                        <Link to={`${datamodel.db(database.id)}/data`}>
                            Data
                        </Link>
                        <Icon name="chevronright" size={8} />
                    </li>,
                    <li className="mr1 flex align-center">
                        <DataModelTableLink id={table.id}>
                            { table.display_name }
                        </DataModelTableLink>
                        { field && <Icon name="chevronright" size={8} /> }
                    </li>
                ]}
                { field && (
                    <li className="mr1">
                        <DataModelFieldLink id={field.id}>
                            { field.display_name }
                        </DataModelFieldLink>
                    </li>
                )}
            </ol>
        )
    }
}

const mapStateToProps = (state, { params }) => ({
    database: getDatabaseById(state, params.databaseId),
    table: getTableById(state, params.tableId),
    field: getFieldById(state, params.fieldId)
})

export default withRouter(connect(mapStateToProps)(BreadcrumbNav))
