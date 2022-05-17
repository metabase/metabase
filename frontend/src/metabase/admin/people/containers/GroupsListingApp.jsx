import React from "react";
import _ from "underscore";
import { connect } from "react-redux";

import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import Group from "metabase/entities/groups";
import { getUserIsAdmin } from "metabase/selectors/user";
import GroupsListing from "../components/GroupsListing";
import { getGroupsWithoutMetabot } from "../selectors";

const mapStateToProps = (state, props) => ({
  groups: getGroupsWithoutMetabot(state, props),
  isAdmin: getUserIsAdmin(state),
});

const mapDispatchToProps = {
  delete: PLUGIN_GROUP_MANAGERS.deleteGroup ?? Group.actions.delete,
};

class GroupsListingApp extends React.Component {
  render() {
    return <GroupsListing {...this.props} />;
  }
}

export default _.compose(
  Group.loadList({ reload: true }),
  connect(mapStateToProps, mapDispatchToProps),
)(GroupsListingApp);
