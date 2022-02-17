import React from "react";

import Group from "metabase/entities/groups";
import GroupsListing from "../components/GroupsListing";

@Group.loadList({ reload: true })
export default class GroupsListingApp extends React.Component {
  render() {
    return <GroupsListing {...this.props} />;
  }
}
