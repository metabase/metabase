import { Component } from "react";
import _ from "underscore";

import Group from "metabase/entities/groups";
import Users from "metabase/entities/users";
import type { State } from "metabase-types/store";

import GroupDetail from "../components/GroupDetail";

class GroupDetailApp extends Component {
  render() {
    return <GroupDetail {...this.props} />;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Users.loadList(),
  Group.load({
    id: (_state: State, props: { params: { groupId: number } }) =>
      props.params.groupId,
    reload: true,
  }),
)(GroupDetailApp);
