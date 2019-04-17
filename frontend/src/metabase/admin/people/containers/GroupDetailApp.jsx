import React, { Component } from "react";
import { connect } from "react-redux";

import User from "metabase/entities/users";
import Group from "metabase/entities/groups";
import { getUsersWithMemberships } from "../selectors";

import GroupDetail from "../components/GroupDetail.jsx";

@User.loadList()
@Group.load({ id: (state, props) => props.params.groupId })
@connect((state, props) => ({
  users: getUsersWithMemberships(state, props),
}))
export default class GroupDetailApp extends Component {
  render() {
    return <GroupDetail {...this.props} />;
  }
}
