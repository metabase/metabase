import React, { Component } from "react";
import { connect } from "react-redux";

import { getGroup, getGroups, getUsers } from "../selectors";
import { fetchGroups, fetchGroupDetails, fetchUsers } from "../permissions";

import GroupDetail from "../components/GroupDetail.jsx";

function mapStateToProps(state, props) {
    return {
        group: getGroup(state, props),
        groups: getGroups(state, props),
        users: getUsers(state, props)
    };
}

const mapDispatchToProps = {
    fetchGroups,
    fetchGroupDetails,
    fetchUsers
};

@connect(mapStateToProps, mapDispatchToProps)
export default class GroupDetailApp extends Component {
    async componentWillMount() {
        await this.props.fetchGroups();
        await this.props.fetchUsers();
    }

    async componentWillReceiveProps(nextProps) {
        const groupID = this.props.routeParams.groupID;
        const nextGroupID = nextProps.routeParams.groupID;

        if (this.props.group && groupID === nextGroupID) return;

        await this.props.fetchGroupDetails(nextGroupID);
    }

    render() {
        return <GroupDetail {...this.props} />;
    }
}
