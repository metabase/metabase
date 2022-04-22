import React from "react";
import { connect } from "react-redux";

import Group from "metabase/entities/groups";
import GroupsListing from "../components/GroupsListing";
import { getGroupsWithoutMetabot } from "../selectors";
import { getUserIsAdmin } from "metabase/selectors/user";

@Group.loadList({ reload: true })
@connect((state, props) => ({
  groups: getGroupsWithoutMetabot(state, props),
  isAdmin: getUserIsAdmin(state),
}))
export default class GroupsListingApp extends React.Component {
  render() {
    return <GroupsListing {...this.props} />;
  }
}
