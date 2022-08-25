import React, { Component } from "react";
import _ from "underscore";

import User from "metabase/entities/users";
import Group from "metabase/entities/groups";

import GroupDetail from "../components/GroupDetail";

class GroupDetailApp extends Component {
  render() {
    return <GroupDetail {...this.props} />;
  }
}

export default _.compose(
  User.loadList(),
  Group.load({ id: (_state, props) => props.params.groupId }),
)(GroupDetailApp);
