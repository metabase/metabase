import React, { Component } from "react";

import Group from "metabase/entities/groups";
import GroupsListing from "../components/GroupsListing.jsx";

@Group.listLoader()
export default class GroupsListingApp extends Component {
  render() {
    return <GroupsListing {...this.props} />;
  }
}
