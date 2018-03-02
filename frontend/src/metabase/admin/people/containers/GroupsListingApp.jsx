import React, { Component } from "react";
import { connect } from "react-redux";

import { getGroups } from "../selectors";
import { loadGroups } from "../people";

import GroupsListing from "../components/GroupsListing.jsx";

const mapStateToProps = function(state, props) {
  return {
    groups: getGroups(state, props),
  };
};

const mapDispatchToProps = {
  loadGroups,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class GroupsListingApp extends Component {
  async componentWillMount() {
    await this.props.loadGroups();
  }

  render() {
    return <GroupsListing {...this.props} />;
  }
}
