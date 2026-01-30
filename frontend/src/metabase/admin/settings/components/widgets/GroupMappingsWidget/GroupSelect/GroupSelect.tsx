import cx from "classnames";
import { t } from "ttag";

import { GroupSummary } from "metabase/admin/people/components/GroupSummary";
import type { GroupIds, UserGroupType } from "metabase/admin/types";
import { PopoverWithTrigger } from "metabase/common/components/PopoverWithTrigger";
import { Select } from "metabase/common/components/Select";
import CS from "metabase/css/core/index.css";
import {
  canEditMembership,
  getGroupColor,
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { Icon } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

type GroupSelectProps = {
  groups: GroupInfo[];
  selectedGroupIds: GroupIds;
  onGroupChange: (group: UserGroupType, selected: boolean) => void;
  isCurrentUser?: boolean;
  emptyListMessage?: string;
};

function getSections(groups: GroupInfo[]) {
  const adminGroup = groups.find(isAdminGroup);
  const defaultGroup = groups.find(isDefaultGroup);
  const topGroups = [defaultGroup, adminGroup].filter((g) => g != null);
  const groupsExceptDefaultAndAdmin = groups.filter(
    (g) => !isAdminGroup(g) && !isDefaultGroup(g),
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
      <GroupSummary
        mr="0.5rem"
        groups={groups}
        selectedGroupIds={selectedGroupIds}
      />
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
            (group) =>
              (selectedGroupIds.includes(group.id) as any) ^
              value.includes(group.id),
          )
          .forEach((group) => onGroupChange(group, value.includes(group.id)));
      }}
      optionDisabledFn={(group: GroupInfo) =>
        (isAdminGroup(group) && isCurrentUser) || !canEditMembership(group)
      }
      optionValueFn={(group: GroupInfo) => group.id}
      optionNameFn={getGroupNameLocalized}
      optionStylesFn={(group: GroupInfo) => ({
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
