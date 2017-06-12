/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchDatabases } from 'metabase/redux/metadata'

import {
    setQueryDatabase,
    setQuerySourceTable
} from 'metabase/query_builder/actions'

import { getMetadata, getDatabasesList } from "metabase/selectors/metadata"

import type {
    DatabaseMetadata,
    TableMetadata
} from "metabase/meta/types/Metadata"

import type { DatabaseId } from "metabase/meta/types/Database"
import type { TableId } from "metabase/meta/types/Table"

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery"

import {
    getQuery,
    getTables,
} from "../selectors";

const mapStateToProps = state => ({
    query:          getQuery(state),
    metadata:       getMetadata(state),
    databases:      getDatabasesList(state),
    tables:         getTables(state)
})

const mapDispatchToProps = {
    fetchDatabases,
    setQueryDatabase,
    setQuerySourceTable,
}

type Props = {
    query: StructuredQuery,
    databases: DatabaseMetadata[],
    tables: TableMetadata[],

    fetchDatabases: () => void,
    setQueryDatabase: (id: DatabaseId) => void,
    setQuerySourceTable: (id: TableId) => void,
}

export class NewQuestionOptions extends Component {
    props: Props

    componentWillMount () {
        this.props.fetchDatabases()
    }
    render () {
        const {
            query,
            databases,
            setQueryDatabase,
            setQuerySourceTable,
            tables
        } = this.props

        const database = query && query.database()
        const table = query && query.table()

        return (
            <div className="wrapper wrapper--trim">
                { !database && (
                    <div>
                        <h2>Pick a database</h2>
                        <ol>
                            { databases.map(database =>
                                <li
                                    key={database.id}
                                    onClick={() => setQueryDatabase(database.id)}
                                >
                                    { database.name }
                                </li>
                            )}
                        </ol>
                    </div>
                )}
                { database && !table && (
                    <div>
                        <h2>Pick a table</h2>
                        <ol>
                            { tables.map(table =>
                                <li
                                    key={table.id}
                                    onClick={() => setQuerySourceTable(table.id)}
                                >
                                    {table.display_name}
                                </li>
                            )}
                        </ol>
                    </div>
                )}
                { table && (
                    <ol>
                        { table.aggregation_options.filter(option => option.short !== "raw").map(option =>
                        <li key={option.short}>
                            {option.name}
                        </li>
                        )}
                    </ol>
                )}
            </div>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(NewQuestionOptions)
