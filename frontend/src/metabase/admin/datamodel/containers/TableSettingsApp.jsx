import React, { Component } from 'react'
import { connect } from "react-redux";

import * as metadataActions from "metabase/redux/metadata";

import { getMetadata } from "metabase/selectors/metadata";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { BackButton, Section, SectionHeader } from "metabase/admin/datamodel/containers/FieldApp";
import ActionButton from "metabase/components/ActionButton.jsx";

import {
    rescanTableFieldValues,
    discardTableFieldValues
} from "../table";


const mapStateToProps = (state, props) => {
    return {
        databaseId: parseInt(props.params.databaseId),
        tableId: parseInt(props.params.tableId),
        metadata: getMetadata(state)
    };
};

const mapDispatchToProps = {
    fetchDatabaseMetadata: metadataActions.fetchDatabaseMetadata,
    fetchTableMetadata: metadataActions.fetchTableMetadata,
    rescanTableFieldValues,
    discardTableFieldValues
};

@connect(mapStateToProps, mapDispatchToProps)
export default class TableSettingsApp extends Component {

    async componentWillMount() {
        const {databaseId, tableId, fetchDatabaseMetadata, fetchTableMetadata} = this.props;

        await fetchDatabaseMetadata(databaseId);
        await fetchTableMetadata(tableId, true);
    }

    render() {
        const { metadata, databaseId, tableId } = this.props;

        const db = metadata && metadata.databases[databaseId];
        const table = metadata && metadata.tables[tableId];
        const isLoading = !table;

        return (
            <LoadingAndErrorWrapper loading={isLoading} error={null} noWrapper>
                { () =>
                    <div className="relative">
                        <div className="wrapper wrapper--trim">
                            <Nav db={db} table={table} />
                            <UpdateFieldValues
                                rescanTableFieldValues={() => this.props.rescanTableFieldValues(table.id)}
                                discardTableFieldValues={() => this.props.discardTableFieldValues(table.id)}
                            />
                        </div>
                    </div>
                }
            </LoadingAndErrorWrapper>
        );
    }
}

class Nav extends Component {
    render () {
        const { db, table } = this.props;
        return (
            <div>
                <BackButton databaseId={db.id} tableId={table.id} />
                <div className="my4 py1 ml-auto mr-auto">
                    <Breadcrumbs
                        crumbs={[
                            db && [db.name, `/admin/datamodel/database/${db.id}`],
                            table && [table.display_name, `/admin/datamodel/database/${db.id}/table/${table.id}`],
                            "Settings"
                        ]}
                    />
                </div>
            </div>
        );
    }
}

class UpdateFieldValues extends Component {
    render () {
        return (
            <Section>
                <SectionHeader
                    title="Cached field values"
                    description="Metabase can scan the values in this table to enable checkbox filters in dashboards and questions."
                />
                <ActionButton
                    className="Button mr2"
                    actionFn={this.props.rescanTableFieldValues}
                    normalText="Re-scan this table"
                    activeText="Starting…"
                    failedText="Failed to start scan"
                    successText="Scan triggered!"
                />
                <ActionButton
                    className="Button Button--danger"
                    actionFn={this.props.discardTableFieldValues}
                    normalText="Discard cached field values"
                    activeText="Starting…"
                    failedText="Failed to discard values"
                    successText="Discard triggered!"
                />
            </Section>
        );
    }
}
