import React, { Component } from "react";
import { connect } from "react-redux";

import { getGroup, getGroups, getUsers } from "../selectors";
import { loadGroups, loadGroupDetails, fetchUsers } from "../people";

import GroupDetail from "../components/GroupDetail.jsx";

function mapStateToProps(state, props) {
  return {
    group: getGroup(state, props),
    groups: getGroups(state, props),
    users: getUsers(state, props),
  };
}

const mapDispatchToProps = {
  loadGroups,
  loadGroupDetails,
  fetchUsers,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class GroupDetailApp extends Component {
  async componentWillMount() {
    this.props.loadGroups();
    this.props.fetchUsers();
    this.props.loadGroupDetails(this.props.params.groupId);
  }

  async componentWillReceiveProps(nextProps) {
    if (nextProps.params.groupId !== this.props.params.groupId) {
      this.props.loadGroupDetails(nextProps.params.groupId);
    }
  }

  render() {
    return <GroupDetail {...this.props} />;
  }
}
