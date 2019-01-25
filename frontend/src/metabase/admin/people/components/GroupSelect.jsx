import React from "react";

import CheckBox from "metabase/components/CheckBox.jsx";

import {
  isDefaultGroup,
  isAdminGroup,
  canEditMembership,
  getGroupColor,
  getGroupNameLocalized,
} from "metabase/lib/groups";
import cx from "classnames";
import _ from "underscore";

export const GroupOption = ({ group, selectedGroups = {}, onGroupChange }) => {
  const disabled = !canEditMembership(group);
  const selected = isDefaultGroup(group) || selectedGroups[group.id];
  return (
    <div
      className={cx("GroupOption flex align-center p1 px2", {
        "cursor-pointer": !disabled,
      })}
      onClick={() => !disabled && onGroupChange(group, !selected)}
    >
      <span className={cx("pr1", getGroupColor(group), { disabled })}>
        <CheckBox checked={selected} size={18} />
      </span>
      {getGroupNameLocalized(group)}
    </div>
  );
};

export const GroupSelect = ({ groups, selectedGroups, onGroupChange }) => {
  const other = groups.filter(g => !isAdminGroup(g) && !isDefaultGroup(g));
  return (
    <div className="GroupSelect scroll-y py1">
      <GroupOption
        group={_.find(groups, isAdminGroup)}
        selectedGroups={selectedGroups}
        onGroupChange={onGroupChange}
      />
      <GroupOption
        group={_.find(groups, isDefaultGroup)}
        selectedGroups={selectedGroups}
        onGroupChange={onGroupChange}
      />
      {other.length > 0 && (
        <div key="divider" className="border-bottom pb1 mb1" />
      )}
      {other.map(group => (
        <GroupOption
          group={group}
          selectedGroups={selectedGroups}
          onGroupChange={onGroupChange}
        />
      ))}
    </div>
  );
};

export default GroupSelect;
