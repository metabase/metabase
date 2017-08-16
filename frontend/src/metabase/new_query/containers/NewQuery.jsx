/* @flow */

import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchDatabases, fetchTableMetadata } from 'metabase/redux/metadata'
import { resetQuery, updateQuery } from '../new_query'

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import Table from "metabase-lib/lib/metadata/Table";
import Database from "metabase-lib/lib/metadata/Database";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery"
import type { TableId } from "metabase/meta/types/Table";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { getMetadata, getTables } from "metabase/selectors/metadata";
import NewQueryOption from "metabase/new_query/components/NewQueryOption";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { getCurrentQuery, getPlainNativeQuery } from "metabase/new_query/selectors";
import Query from "metabase-lib/lib/queries/Query";

const mapStateToProps = state => ({
    query: getCurrentQuery(state),
    plainNativeQuery: getPlainNativeQuery(state),
    metadata: getMetadata(state),
    tables: getTables(state)
})

const mapDispatchToProps = {
    fetchDatabases,
    fetchTableMetadata,
    resetQuery,
    updateQuery
}


type Props = {
    // Component parameters
    onComplete: (StructuredQuery) => void,

    // Properties injected with redux connect
    query: StructuredQuery,
    plainNativeQuery: NativeQuery,

    resetQuery: () => void,
    updateQuery: (Query) => void,

    fetchDatabases: () => void,
    fetchTableMetadata: (TableId) => void,

    metadata: Metadata
}

export class NewQuery extends Component {
    props: Props

    componentWillMount() {
        this.props.fetchDatabases();
        this.props.resetQuery();
    }

    startGuiQuery = (database: Database) => {
        this.props.onComplete(this.props.query);
    }

    startNativeQuery = (table: Table) => {
        this.props.onComplete(this.props.plainNativeQuery);
    }

    // NOTE: Not in the first iteration yet!
    //
    // showMetricSearch = () => {
    //
    // }
    //
    // showSegmentSearch = () => {
    //
    // }
    //
    // startMetricQuery = (metric: Metric) => {
    //     this.props.fetchTableMetadata(metric.table().id);
    //
    //     this.props.updateQuery(
    //         this.props.query
    //             .setDatabase(metric.database)
    //             .setTable(metric.table)
    //             .addAggregation(metric.aggregationClause())
    //     )
    //         this.props.onComplete(updatedQuery);
    // }

    render() {
        const { query } = this.props

        if (!query) {
            return <LoadingAndErrorWrapper loading={true}/>
        }

        return (
            <div className="flex-full full ml-auto mr-auto px1 mt4 mb2 align-center"
                 style={{maxWidth: "800px"}}>
                <ol className="flex-full Grid Grid--guttersXl Grid--full small-Grid--1of2">

                    {/*<li className="Grid-cell">
                        <NewQueryOption
                            image="/app/img/questions_illustration"
                            title="Metrics"
                            description="See data over time, as a map, or pivoted to help you understand trends or changes."
                        />
                    </li>
                    <li className="Grid-cell">
                        <NewQueryOption
                            image="/app/img/list_illustration"
                            title="Segments"
                            description="Explore tables and see what’s going on underneath your charts."
                            width={180}
                        />
                    </li>*/}

                    <li className="Grid-cell">
                        {/*TODO: Move illustrations to the new location in file hierarchy. At the same time put an end to the equal-size-@2x ridicule. */}
                        <NewQueryOption
                            image="/app/img/custom_question"
                            title="New question"
                            description="Use the simple query builder to see trends, lists of things, or to create your own metrics."
                            onClick={this.startGuiQuery}
                        />
                    </li>
                    <li className="Grid-cell">
                        <NewQueryOption
                            image="/app/img/sql_illustration@2x"
                            title="SQL"
                            description="For more complicated questions, you can write your own SQL."
                            onClick={this.startNativeQuery}
                        />
                    </li>
                </ol>
            </div>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(NewQuery)
