import React from "react";
import _ from "underscore";
import { connect } from "react-redux";

import Group from "metabase/entities/groups";
import GroupsListing from "../components/GroupsListing";
import { getGroupsWithoutMetabot } from "../selectors";
import { getUserIsAdmin } from "metabase/selectors/user";

class GroupsListingApp extends React.Component {
  render() {
    return <GroupsListing {...this.props} />;
  }
}

export default _.compose(
  Group.loadList({ reload: true }),
  connect((state, props) => ({
    groups: getGroupsWithoutMetabot(state, props),
    isAdmin: getUserIsAdmin(state),
  })),
)(GroupsListingApp);
