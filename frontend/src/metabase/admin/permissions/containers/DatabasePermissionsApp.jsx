import React, { Component } from "react";
import { connect } from "react-redux";

import { getDatabases, getDatabasePermissions, getGroups } from "../selectors";
import { fetchDatabases, fetchDatabasePermissions, fetchGroups } from "../permissions";

import DatabasePermissions from "../components/DatabasePermissions.jsx";


function mapStateToProps(state, props) {
    return {
        databases: getDatabases(state, props),
        databasePermissions: getDatabasePermissions(state, props),
        groups: getGroups(state, props)
    };
}

const mapDispatchToProps = {
    fetchDatabases,
    fetchDatabasePermissions,
    fetchGroups
};


@connect(mapStateToProps, mapDispatchToProps)
export default class DatabasePermissionsApp extends Component {
    // fetch the data for the left-hand nav and the groups drop-down when the component mounts
    async componentWillMount() {
        await this.props.fetchDatabases();
        await this.props.fetchGroups();
    }

    // fetch the details for this specific group whenever props change (i.e. on first load *or* if someone switches group or db)
    async componentWillReceiveProps(nextProps) {
        const { databaseID, groupID } = this.props.routeParams || {};
        const { databaseID: nextDatabaseID, groupID: nextGroupID } = nextProps.routeParams || {};

        if (this.props.databasePermissions && nextDatabaseID === databaseID && nextGroupID === groupID) return;

        await this.props.fetchDatabasePermissions(nextDatabaseID, nextGroupID);
    }

    render () {
        return (
            <DatabasePermissions {...this.props} />
        );
    }
}
