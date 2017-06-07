import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchDatabases } from 'metabase/redux/metadata'

import {
    setQueryDatabase,
    setQuerySourceTable
} from 'metabase/query_builder/actions'

import { getMetadata, getDatabasesList } from "metabase/selectors/metadata";

import {
    getQuery,
    getTables,
    getTableMetadata,
} from "../selectors";

type Props = {
    query: StructuredQuery,
}

class NewQuestionOptions extends Component {

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

        const database = query.database()
        const table = query.table()

        window.query = query

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
                                <li onClick={() => setQuerySourceTable(table.id)}>
                                    {table.display_name}
                                </li>
                            )}
                        </ol>
                    </div>
                )}
                { table && (
                    <ol>
                        { table.aggregation_options.filter(option => option.short !== "raw").map(option =>
                        <li>
                            {option.name}
                        </li>
                        )}
                    </ol>
                )}
            </div>
        )
    }
}

const mapStateToProps = state => ({
    query:          getQuery(state),
    metadata:       getMetadata(state),
    databases:      getDatabasesList(state),
    tables:         getTables(state)
})

export default connect(
    mapStateToProps,
    {
        fetchDatabases,
        setQueryDatabase,
        setQuerySourceTable,
    }
)(NewQuestionOptions)
