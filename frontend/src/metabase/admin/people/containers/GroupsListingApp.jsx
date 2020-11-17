import React from "react";
import { connect } from "react-redux";

import Group from "metabase/entities/groups";
import GroupsListing from "../components/GroupsListing";
import { getGroupsWithoutMetabot } from "../selectors";

@Group.loadList()
@connect((state, props) => ({
  groups: getGroupsWithoutMetabot(state, props),
}))
export default class GroupsListingApp extends React.Component {
  render() {
    return <GroupsListing {...this.props} />;
  }
}
