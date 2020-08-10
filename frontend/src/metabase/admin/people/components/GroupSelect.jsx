import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Select from "metabase/components/Select";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import GroupSummary from "./GroupSummary";

import {
  isDefaultGroup,
  isAdminGroup,
  canEditMembership,
  getGroupColor,
  getGroupNameLocalized,
} from "metabase/lib/groups";

export const GroupSelect = ({
  groups,
  selectedGroupIds = new Set(),
  onGroupChange,
  isCurrentUser = false,
  emptyListMessage = t`No groups`,
}) => {
  const triggerElement = (
    <div className="flex align-center">
      <span className="mr1 text-medium">
        <GroupSummary groups={groups} selectedGroupIds={selectedGroupIds} />
      </span>
      <Icon className="text-light" name="chevrondown" size={10} />
    </div>
  );

  if (groups.length === 0) {
    return (
      <PopoverWithTrigger triggerElement={triggerElement}>
        <span className="p1">{emptyListMessage}</span>
      </PopoverWithTrigger>
    );
  }
  const other = groups.filter(g => !isAdminGroup(g) && !isDefaultGroup(g));
  const adminGroup = groups.find(isAdminGroup);
  const defaultGroup = groups.find(isDefaultGroup);
  const topGroups = [defaultGroup, adminGroup].filter(g => g != null);

  return (
    <Select
      triggerElement={triggerElement}
      onChange={({ target: { value } }) => {
        groups
          .filter(
            // find the differing groups between the new `value` on previous `selectedGroupIds`
            group =>
              selectedGroupIds.includes(group.id) ^ value.includes(group.id),
          )
          .forEach(group => onGroupChange(group, value.includes(group.id)));
      }}
      optionDisabledFn={group =>
        (isAdminGroup(group) && isCurrentUser) || !canEditMembership(group)
      }
      optionValueFn={group => group.id}
      optionNameFn={getGroupNameLocalized}
      optionClassNameFn={getGroupColor}
      value={selectedGroupIds}
      sections={
        topGroups.length > 0
          ? [{ items: topGroups }, { items: other, name: t`Groups` }]
          : [{ items: other }]
      }
      multiple
    />
  );
};

export default GroupSelect;
