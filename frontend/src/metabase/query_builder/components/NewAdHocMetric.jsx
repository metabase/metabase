import React, { Component } from "react";
import { connect } from "react-redux";

import { fetchDatabases } from 'metabase/redux/metadata'

import NewQuestionBar from "../containers/NewQuestionBar";
import NewQuestionOptions from "../containers/NewQuestionOptions";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Question from "metabase-lib/lib/Question";
import Table from "metabase-lib/lib/metadata/Table";

const mapDispatchToProps = {
    fetchDatabases
}

type Props = {
    // User-provided props
    question: Question,

    // Connected props
    fetchDatabases: () => void
}

@connect(null, mapDispatchToProps)
export default class NewAdHocMetric extends Component {
    state: {
        newQuery: null
    }

    props: Props

    componentWillMount = () => {
        // this.props.fetchDatabases()
    }

    /** Simplified versions of the equally named QB actions **/
    setQueryDatabase = (databaseId) => {
        const { question } = this.props;

        const newQuery = StructuredQuery.newStucturedQuery({ question, databaseId })
        this.setState({ newQuery });
    }

    setQuerySourceTable = (table: Table) => {
        this.setState({ newQuery: this.state.newQuery.setTable(table) })
    }

    render() {
        return (
            <div className="spread flex">
                <div className="flex flex-column flex-full bg-white">
                    <NewQuestionBar />
                    <NewQuestionOptions
                        // TODO: Make sure that we have a complete database metadata when opening ad-hoc metric flow;
                        // if not, then we should load it again here
                        fetchDatabases={() => {}}
                        setQueryDatabase={this.setQueryDatabase}
                        setQuerySourceTable={this.setQuerySourceTable}
                        setAggregation={this.setAggregation}
                    />
                </div>
            </div>
        );
    }
}
