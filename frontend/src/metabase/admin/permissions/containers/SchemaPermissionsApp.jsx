import React, { Component } from "react";
import { connect } from "react-redux";

import { getDatabases, getGroups, getSchemaPermissions } from "../selectors";
import { fetchDatabases, fetchGroups, fetchSchemaPermissions } from "../permissions";

import SchemaPermissions from "../components/SchemaPermissions.jsx";


function mapStateToProps(state, props) {
    return {
        databases: getDatabases(state, props),
        groups: getGroups(state, props),
        schemaPermissions: getSchemaPermissions(state, props)
    };
}

const mapDispatchToProps = {
    fetchDatabases,
    fetchGroups,
    fetchSchemaPermissions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class SchemaPermissionsApp extends Component {
    async componentWillMount() {
        await this.props.fetchDatabases();
        await this.props.fetchGroups();
        await this.props.fetchSchemaPermissions(this.props.routeParams);
    }

    render() {
        return (
            <SchemaPermissions {...this.props} />
        );
    }
}
