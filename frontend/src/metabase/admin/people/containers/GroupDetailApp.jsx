import { Component } from "react";
import _ from "underscore";

import Group from "metabase/entities/groups";
import User from "metabase/entities/users";

import GroupDetail from "../components/GroupDetail";

class GroupDetailApp extends Component {
  render() {
    return <GroupDetail {...this.props} />;
  }
}

export default _.compose(
  User.loadList(),
  Group.load({ id: (_state, props) => props.params.groupId, reload: true }),
)(GroupDetailApp);
