import React from "react";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import GroupSelect from "metabase/admin/people/components/GroupSelect";
import GroupSummary from "metabase/admin/people/components/GroupSummary";
import SelectButton from "metabase/components/SelectButton";
import Toggle from "metabase/components/Toggle";

import Group from "metabase/entities/groups";

import { t } from "ttag";
import _ from "underscore";

import {
  isDefaultGroup,
  isAdminGroup,
  canEditMembership,
} from "metabase/lib/groups";

const FormGroupsWidget = ({ field: { value, onChange }, groups }) => {
  const adminGroup = _.find(groups, isAdminGroup);
  const defaultGroup = _.find(groups, isDefaultGroup);

  if (!value) {
    value = [defaultGroup.id];
  }

  const selection = new Set(value);
  // NOTE: for legacy selectedGroups prop on GroupSummary and GroupSelect. Prefer using a Set
  const selectedGroups = _.object(value.map(id => [id, true]));

  function onGroupChange(group, selected) {
    const newSelection = new Set(selection);
    if (selected) {
      newSelection.add(group.id);
    } else {
      newSelection.delete(group.id);
    }
    onChange(Array.from(newSelection));
  }

  const visibleGroups = _.filter(
    groups,
    g => canEditMembership(g) || isDefaultGroup(g),
  );
  const hadAdminGroup = !!adminGroup;
  const hasNonAdminEditableGroups = _.any(
    groups,
    g => canEditMembership(g) && !isAdminGroup(g),
  );

  return hasNonAdminEditableGroups ? (
    <PopoverWithTrigger
      sizeToFit
      triggerElement={
        <SelectButton>
          <GroupSummary groups={groups} selectedGroups={selectedGroups} />
        </SelectButton>
      }
    >
      <GroupSelect
        groups={visibleGroups}
        selectedGroups={selectedGroups}
        onGroupChange={onGroupChange}
      />
    </PopoverWithTrigger>
  ) : hadAdminGroup ? (
    <div className="flex align-center">
      <Toggle
        value={selection.has(adminGroup.id)}
        onChange={isAdmin => {
          onGroupChange(adminGroup, isAdmin);
        }}
      />
      <span className="ml2">{t`Make this user an admin`}</span>
    </div>
  ) : null;
};

export default Group.loadList()(FormGroupsWidget);
