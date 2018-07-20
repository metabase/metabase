/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import GroupSelect from "./GroupSelect.jsx";
import GroupSummary from "./GroupSummary.jsx";

const GroupOption = ({ name, color, selected, disabled, onChange }) => (
  <div
    className={cx("flex align-center p1 px2", { "cursor-pointer": !disabled })}
    onClick={() => !disabled && onChange(!selected)}
  >
    <span className={cx("pr1", color, { disabled })}>
      <CheckBox checked={selected} size={18} />
    </span>
    {name}
  </div>
);

GroupOption.propTypes = {
  name: PropTypes.string,
  color: PropTypes.string,
  selected: PropTypes.bool,
  disabled: PropTypes.bool,
  onChange: PropTypes.func,
};

export default class UserGroupSelect extends Component {
  static propTypes = {
    user: PropTypes.object.isRequired,
    groups: PropTypes.array,
    createMembership: PropTypes.func.isRequired,
    deleteMembership: PropTypes.func.isRequired,
  };

  static defaultProps = {
    isInitiallyOpen: false,
  };

  toggle() {
    this.refs.popover.toggle();
  }

  render() {
    let { user, groups, createMembership, deleteMembership } = this.props;

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

    return (
      <PopoverWithTrigger
        ref="popover"
        triggerElement={
          <div className="flex align-center">
            <span className="mr1 text-medium">
              <GroupSummary groups={groups} selectedGroups={user.memberships} />
            </span>
            <Icon className="text-light" name="chevrondown" size={10} />
          </div>
        }
        triggerClasses="AdminSelectBorderless py1"
        sizeToFit
      >
        <GroupSelect
          groups={groups}
          selectedGroups={user.memberships}
          onGroupChange={changeMembership}
        />
      </PopoverWithTrigger>
    );
  }
}
