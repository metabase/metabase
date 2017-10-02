import React, { Component } from 'react'
import { connect } from 'react-redux'

import {
    fetchDatabases,
    fetchMetrics,
    fetchSegments,
} from 'metabase/redux/metadata'

import { withBackground } from 'metabase/hoc/Background'
import { resetQuery } from '../new_query'

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery"
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { getMetadata, getMetadataFetched } from "metabase/selectors/metadata";
import NewQueryOption from "metabase/new_query/components/NewQueryOption";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { getCurrentQuery, getPlainNativeQuery } from "metabase/new_query/selectors";
import { getUserIsAdmin } from "metabase/selectors/user";
import { push } from "react-router-redux";
import NoDatabasesEmptyState from "metabase/reference/databases/NoDatabasesEmptyState";

const mapStateToProps = state => ({
    query: getCurrentQuery(state),
    plainNativeQuery: getPlainNativeQuery(state),
    metadata: getMetadata(state),
    metadataFetched: getMetadataFetched(state),
    isAdmin: getUserIsAdmin(state)
})

const mapDispatchToProps = {
    fetchDatabases,
    fetchMetrics,
    fetchSegments,
    resetQuery,
    push
}

type Props = {
    // Component parameters
    getUrlForQuery: (StructuredQuery) => void,
    metricSearchUrl: string,
    tableSearchUrl: string,

    // Properties injected with redux connect
    query: StructuredQuery,
    plainNativeQuery: NativeQuery,
    metadata: Metadata,
    isAdmin: boolean,

    resetQuery: () => void,

    fetchDatabases: () => void,
    fetchMetrics: () => void,
    fetchSegments: () => void,
}

const allOptionsVisibleState = {
    loaded: true,
    hasDatabases: true,
    showMetricOption: true,
    showTableOption: true,
    showSQLOption: true
}

export class NewQueryOptions extends Component {
    props: Props

    constructor(props) {
        super(props)

        // By default, show all options instantly to admins
        this.state = props.isAdmin ? allOptionsVisibleState : {
            loaded: false,
            hasDatabases: false,
            showMetricOption: false,
            showTableOption: false,
            showSQLOption: false
        }
    }

    determineWhichOptionsToShow() {
        const { isAdmin, metadata, push } = this.props
        const hasDatabases = metadata.databasesList().length > 0

        console.log(metadata.databasesList())
        if (!hasDatabases) {
            this.setState({ loaded: true, hasDatabases: false })
        } else if (isAdmin) {
            this.setState(allOptionsVisibleState)
        } else {
            const showMetricOption = metadata.metricsList().length > 0
            const showTableOption = metadata.segmentsList().length > 0

            // to be able to use SQL the user must have write permissions on at least one db
            const hasSQLPermission = (db) => db.native_permissions === "write"
            const showSQLOption = metadata.databasesList().filter(hasSQLPermission).length > 0

            // if we can only show one option then we should just redirect
            const redirectToQueryBuilder =
                !showMetricOption && !showSQLOption && !showTableOption

            if (redirectToQueryBuilder) {
                push(this.getGuiQueryUrl())
            } else {
                this.setState({
                    loaded: true,
                    showMetricOption,
                    showTableOption,
                    showSQLOption,
                })
            }
        }
    }

    async componentWillMount() {
        this.props.resetQuery();

        Promise.all([
            this.props.fetchDatabases(),
            this.props.fetchMetrics(),
            this.props.fetchSegments()
        ]).then(() => this.determineWhichOptionsToShow())
    }

    getGuiQueryUrl = () => {
        return this.props.getUrlForQuery(this.props.query);
    }

    getNativeQueryUrl = () => {
        return this.props.getUrlForQuery(this.props.plainNativeQuery);
    }

    render() {
        const { isAdmin, metricSearchUrl, tableSearchUrl } = this.props
        const { loaded, hasDatabases, showMetricOption, showTableOption, showSQLOption } = this.state
        const showCustomInsteadOfNewQuestionText = showMetricOption || showTableOption || isAdmin

        if (!loaded) {
            return <LoadingAndErrorWrapper loading={true}/>
        }

        if (!hasDatabases) {
            return (
                <div className="full-height flex align-center justify-center">
                    <NoDatabasesEmptyState/>
                </div>
            )
        }

        return (
            <div className="full-height flex">
                <div className="wrapper wrapper--trim lg-wrapper--trim xl-wrapper--trim flex-full px1 mt4 mb2 align-center">
                     <div className="flex align-center justify-center" style={{minHeight: "100%"}}>
                        <ol className="flex-full Grid Grid--guttersXl Grid--full sm-Grid--normal">
                            { showMetricOption &&
                                <li className="Grid-cell">
                                    <NewQueryOption
                                        image="/app/img/questions_illustration"
                                        title="Metrics"
                                        description="See data over time, as a map, or pivoted to help you understand trends or changes."
                                        to={metricSearchUrl}
                                    />
                                </li>
                            }
                            { showTableOption &&
                                <li className="Grid-cell">
                                    <NewQueryOption
                                        image="/app/img/list_illustration"
                                        title="Tables"
                                        description="Explore tables and see what’s going on underneath your charts."
                                        width={180}
                                        to={tableSearchUrl}
                                    />
                                </li>
                            }
                            <li className="Grid-cell">
                                {/*TODO: Move illustrations to the new location in file hierarchy. At the same time put an end to the equal-size-@2x ridicule. */}
                                <NewQueryOption
                                    image="/app/img/query_builder_illustration"
                                    title={ showCustomInsteadOfNewQuestionText ? "Custom" : "New question"}
                                    description="Use the simple query builder to see trends, lists of things, or to create your own metrics."
                                    width={180}
                                    to={this.getGuiQueryUrl}
                                />
                            </li>
                            { showSQLOption &&
                                <li className="Grid-cell">
                                    <NewQueryOption
                                        image="/app/img/sql_illustration"
                                        title="SQL"
                                        description="For more complicated questions, you can write your own SQL."
                                        to={this.getNativeQueryUrl}
                                    />
                                </li>
                            }
                        </ol>
                    </div>
                </div>
            </div>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(withBackground('bg-slate-extra-light')(NewQueryOptions))
