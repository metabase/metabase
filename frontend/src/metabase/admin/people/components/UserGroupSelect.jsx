import React, { Component } from "react";
import PropTypes from "prop-types";
import Group from "metabase/entities/groups";
import { connect } from "react-redux";

import { createMembership, deleteMembership } from "../people";
import { getGroupsWithoutMetabot, getUserMemberships } from "../selectors";

import LoadingSpinner from "metabase/components/LoadingSpinner";

import GroupSelect from "./GroupSelect";

@Group.loadList()
@connect(
  (state, props) => ({
    groups: getGroupsWithoutMetabot(state, props),
    userMemberships: getUserMemberships(state, props),
  }),
  {
    createMembership,
    deleteMembership,
  },
)
export default class UserGroupSelect extends Component {
  static propTypes = {
    userId: PropTypes.number.isRequired,
    isCurrentUser: PropTypes.bool.isRequired,
    userMemberships: PropTypes.array,
    groups: PropTypes.array,
    loading: PropTypes.bool.isRequired,
    createMembership: PropTypes.func.isRequired,
    deleteMembership: PropTypes.func.isRequired,
  };

  handleGroupChange = (group, isAdded) => {
    const {
      userId,
      userMemberships,
      createMembership,
      deleteMembership,
    } = this.props;

    if (isAdded) {
      createMembership({ groupId: group.id, userId });
    } else {
      const membershipId = userMemberships.find(m => m.group_id === group.id)
        .membership_id;

      deleteMembership({ membershipId });
    }
  };

  render() {
    const { loading, groups, userMemberships, isCurrentUser } = this.props;

    if (loading || !userMemberships) {
      return <LoadingSpinner />;
    }

    const selectedGroupIds = Object.values(userMemberships).map(
      m => m.group_id,
    );

    return (
      <GroupSelect
        groups={groups}
        selectedGroupIds={selectedGroupIds}
        onGroupChange={this.handleGroupChange}
        isCurrentUser={isCurrentUser}
      />
    );
  }
}
