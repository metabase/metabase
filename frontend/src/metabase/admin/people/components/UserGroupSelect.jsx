/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import LoadingSpinner from "metabase/components/LoadingSpinner";

import GroupSelect from "./GroupSelect";

export default class UserGroupSelect extends Component {
  static propTypes = {
    user: PropTypes.object.isRequired,
    groups: PropTypes.array,
    createMembership: PropTypes.func.isRequired,
    deleteMembership: PropTypes.func.isRequired,
    isCurrentUser: PropTypes.bool.isRequired,
  };

  static defaultProps = {
    isInitiallyOpen: false,
  };

  toggle() {
    this.refs.popover.toggle();
  }

  render() {
    const {
      user,
      groups,
      createMembership,
      deleteMembership,
      isCurrentUser,
    } = this.props;

    if (!groups || groups.length === 0 || !user.memberships) {
      return <LoadingSpinner />;
    }

    const changeMembership = (group, member) => {
      if (member) {
        createMembership({ groupId: group.id, userId: user.id });
      } else {
        deleteMembership({
          membershipId: user.memberships[group.id].membership_id,
        });
      }
    };
    const selectedGroupIds = Object.values(user.memberships).map(
      m => m.group_id,
    );
    return (
      <GroupSelect
        groups={groups}
        selectedGroupIds={selectedGroupIds}
        onGroupChange={changeMembership}
        isCurrentUser={isCurrentUser}
      />
    );
  }
}
