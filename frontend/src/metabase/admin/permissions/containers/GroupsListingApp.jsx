import React, { Component } from "react";
import { connect } from "react-redux";

import { getGroups } from "../selectors";
import { fetchGroups } from "../permissions";

import GroupsListing from "../components/GroupsListing.jsx";

const mapStateToProps = function(state, props) {
    return {
        groups: getGroups(state, props)
    };
}

const mapDispatchToProps = {
    fetchGroups
};

@connect(mapStateToProps, mapDispatchToProps)
export default class GroupsListingApp extends Component {
    async componentWillMount() {
        await this.props.fetchGroups();
    }

    render() {
        return (
            <GroupsListing {...this.props} />
        );
    }
}
