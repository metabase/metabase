/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchDatabases } from 'metabase/redux/metadata'

import { initializeNewQuery, updateQuery } from '../new_query'

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery"

import Question from "metabase-lib/lib/Question";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { getQuery } from "../selectors";
import Table from "metabase-lib/lib/metadata/Table";
import Database from "metabase-lib/lib/metadata/Database";

import type { Aggregation } from "metabase/meta/types/Query";

class OptionListItem extends Component {
    props: {
        item: any,
        action: (any) => void,
        children?: React$Element<any>
    }
    onClick = () => { this.props.action(this.props.item); }

    render() {
        return (
            <li onClick={this.onClick}>
                { this.props.children }
            </li>
        );
    }
}

const mapStateToProps = state => ({
    query: getQuery(state),
})

const mapDispatchToProps = {
    fetchDatabases,
    initializeNewQuery,
    updateQuery
}

type Props = {
    // Component parameters
    question: Question,
    onComplete: (StructuredQuery) => void,

    // Properties injected with redux connect
    query: StructuredQuery,
    initializeNewQuery: () => void,
    updateQuery: (StructuredQuery) => void,

    fetchDatabases: () => void,
}

/**
 * NewQueryOptions forms together with NewQueryBar the elements of new query flow.
 * It renders the current options to choose from (for instance databases, tables or metrics).
 */
export class NewQueryOptions extends Component {
    props: Props

    componentWillMount() {
        const { question } = this.props;
        this.props.fetchDatabases()
        this.props.initializeNewQuery(question);
    }

    setDatabase = (database: Database) => {
        this.props.updateQuery(this.props.query.setDatabase(database))
    }

    setTable = (table: Table) => {
        this.props.updateQuery(this.props.query.setTable(table))
    }

    setAggregation = (aggregation: Aggregation) => {
        const query = this.props.query.addAggregation(aggregation);
        this.props.updateQuery(this.props.query.addAggregation(aggregation))
        this.props.onComplete(query);
    }

    render() {
        const {query} = this.props

        if (!query) {
            return <LoadingAndErrorWrapper loading={true}/>
        }
        const database = query.database()
        const table = query.table()

        return (
            <LoadingAndErrorWrapper loading={!query}>
                <div className="wrapper wrapper--trim">
                    { !database && (
                        <div>
                            <h2>Pick a database</h2>
                            <ol>
                                { query.metadata().databasesList().map(database =>
                                    <OptionListItem key={database.id} item={database} action={this.setDatabase}>
                                        { database.name }
                                    </OptionListItem>
                                )}
                            </ol>
                        </div>
                    )}
                    { database && !table && (
                        <div>
                            <h2>Pick a table</h2>
                            <ol>
                                { database.tables.map(table =>
                                    <OptionListItem key={table.id} item={table} action={this.setTable}>
                                        { table.display_name }
                                    </OptionListItem>
                                )}
                            </ol>
                        </div>
                    )}
                    { table && (
                        <ol>
                            { query.aggregationOptionsWithoutRaw().map(option =>
                                <OptionListItem key={option.short} item={table} action={this.setAggregation}>
                                    {option.name}
                                </OptionListItem>
                            )}
                        </ol>
                    )}
                </div>
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(NewQueryOptions)
