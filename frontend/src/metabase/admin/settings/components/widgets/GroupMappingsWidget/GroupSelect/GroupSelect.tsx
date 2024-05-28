import cx from "classnames";
import { t } from "ttag";

import GroupSummary from "metabase/admin/people/components/GroupSummary";
import type {
  GroupIds,
  UserGroupType,
  UserGroupsType,
} from "metabase/admin/types";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Select from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
import {
  isDefaultGroup,
  isAdminGroup,
  canEditMembership,
  getGroupColor,
  getGroupNameLocalized,
} from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { Icon } from "metabase/ui";

type GroupSelectProps = {
  groups: UserGroupsType;
  selectedGroupIds: GroupIds;
  onGroupChange: (group: UserGroupType, selected: boolean) => void;
  isCurrentUser?: boolean;
  emptyListMessage?: string;
};

function getSections(groups: UserGroupsType) {
  const adminGroup = groups.find(isAdminGroup);
  const defaultGroup = groups.find(isDefaultGroup);
  const topGroups = [defaultGroup, adminGroup].filter(g => g != null);
  const groupsExceptDefaultAndAdmin = groups.filter(
    g => !isAdminGroup(g) && !isDefaultGroup(g),
  );

  if (topGroups.length === 0) {
    return [{ items: groupsExceptDefaultAndAdmin }];
  }

  return [
    { items: topGroups },
    groupsExceptDefaultAndAdmin.length > 0
      ? {
          items: groupsExceptDefaultAndAdmin as any,
          name: t`Groups`,
        }
      : null,
  ].filter(isNotNull);
}

export const GroupSelect = ({
  groups,
  selectedGroupIds = [],
  onGroupChange,
  isCurrentUser = false,
  emptyListMessage = t`No groups`,
}: GroupSelectProps) => {
  const triggerElement = (
    <div className={cx(CS.flex, CS.alignCenter)}>
      <span className={cx(CS.mr1, CS.textMedium)}>
        <GroupSummary groups={groups} selectedGroupIds={selectedGroupIds} />
      </span>
      <Icon className={CS.textLight} name="chevrondown" size={10} />
    </div>
  );

  if (groups.length === 0) {
    return (
      <PopoverWithTrigger triggerElement={triggerElement}>
        <span className={CS.p1}>{emptyListMessage}</span>
      </PopoverWithTrigger>
    );
  }

  const sections = getSections(groups);

  return (
    <Select
      triggerElement={triggerElement}
      onChange={({ target: { value } }: { target: { value: any } }) => {
        groups
          .filter(
            // find the differing groups between the new `value` on previous `selectedGroupIds`
            group =>
              (selectedGroupIds.includes(group.id) as any) ^
              value.includes(group.id),
          )
          .forEach(group => onGroupChange(group, value.includes(group.id)));
      }}
      optionDisabledFn={(group: UserGroupType) =>
        (isAdminGroup(group) && isCurrentUser) || !canEditMembership(group)
      }
      optionValueFn={(group: UserGroupType) => group.id}
      optionNameFn={getGroupNameLocalized}
      optionStylesFn={(group: UserGroupType) => ({
        color: getGroupColor(group),
      })}
      value={selectedGroupIds}
      sections={sections}
      multiple
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default GroupSelect;
