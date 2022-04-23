import React, { Component } from "react";

import User from "metabase/entities/users";
import Group from "metabase/entities/groups";

import GroupDetail from "../components/GroupDetail";

@User.loadList()
@Group.load({ id: (_state, props) => props.params.groupId })
export default class GroupDetailApp extends Component {
  render() {
    return <GroupDetail {...this.props} />;
  }
}
