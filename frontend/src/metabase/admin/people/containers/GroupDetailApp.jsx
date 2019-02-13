import React, { Component } from "react";
import { connect } from "react-redux";

import User from "metabase/entities/users";
import Group from "metabase/entities/groups";
import { getUsersWithMemberships } from "../selectors";

import GroupDetail from "../components/GroupDetail.jsx";

@User.listLoader()
@Group.loader({ id: (state, props) => props.params.groupId })
@Group.listLoader()
@connect((state, props) => ({
  users: getUsersWithMemberships(state, props),
}))
export default class GroupDetailApp extends Component {
  render() {
    return <GroupDetail {...this.props} />;
  }
}
