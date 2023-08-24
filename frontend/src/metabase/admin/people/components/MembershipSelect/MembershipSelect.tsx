import { Fragment } from "react";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import {
  isDefaultGroup,
  isAdminGroup,
  getGroupNameLocalized,
} from "metabase/lib/groups";
import type { Group, Member } from "metabase-types/api";
import { isNotNull } from "metabase/core/utils/types";
import GroupSummary from "../GroupSummary";
import {
  MembershipActionsContainer,
  MembershipSelectContainer,
  MembershipSelectHeader,
  MembershipSelectItem,
} from "./MembershipSelect.styled";

const getGroupSections = (groups: Group[]) => {
  const defaultGroup = groups.find(isDefaultGroup);
  const adminGroup = groups.find(isAdminGroup);
  const pinnedGroups = [defaultGroup, adminGroup].filter(isNotNull);
  const regularGroups = groups.filter(
    group => !isAdminGroup(group) && !isDefaultGroup(group),
  );

  if (pinnedGroups.length > 0) {
    return [
      {
        groups: pinnedGroups,
      },
      { groups: regularGroups, header: t`Groups` },
    ];
  }

  return [{ groups: regularGroups }];
};

type Memberships = Map<Group["id"], Partial<Member>>;

interface MembershipSelectProps {
  groups: Group[];
  memberships: Memberships;
  isCurrentUser: boolean;
  isUserAdmin: boolean;
  emptyListMessage?: string;
  onAdd: (groupId: number, membershipData: Partial<Member>) => void;
  onRemove: (groupId: number) => void;
  onChange: (groupId: number, membershipData: Partial<Member>) => void;
}

export const MembershipSelect = ({
  groups,
  memberships = new Map(),
  onAdd,
  onRemove,
  onChange,
  isCurrentUser = false,
  isUserAdmin = false,
  emptyListMessage = t`No groups`,
}: MembershipSelectProps) => {
  const selectedGroupIds = Array.from(memberships.keys());
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

  const groupSections = getGroupSections(groups);

  const handleToggleMembership = (groupId: number) => {
    if (memberships.has(groupId)) {
      onRemove(groupId);
    } else {
      onAdd(groupId, { is_group_manager: false });
    }
  };

  const handleChangeMembership = (
    groupId: number,
    membershipData: Partial<Member>,
  ) => {
    onChange(groupId, membershipData);
  };

  return (
    <PopoverWithTrigger triggerElement={triggerElement}>
      <MembershipSelectContainer>
        {groupSections.map((section, index) => (
          <Fragment key={index}>
            {section.header && (
              <MembershipSelectHeader>{section.header}</MembershipSelectHeader>
            )}
            {section.groups.map(group => {
              const isDisabled =
                (isAdminGroup(group) && isCurrentUser) || isDefaultGroup(group);
              const isMember = memberships.has(group.id);
              const canEditMembershipType =
                isMember && !isUserAdmin && !isDisabled && !isAdminGroup(group);

              return (
                <MembershipSelectItem
                  isDisabled={isDisabled}
                  key={group.id}
                  onClick={() =>
                    isDisabled ? undefined : handleToggleMembership(group.id)
                  }
                >
                  <span>{getGroupNameLocalized(group)}</span>
                  <MembershipActionsContainer>
                    {canEditMembershipType && (
                      <PLUGIN_GROUP_MANAGERS.UserTypeToggle
                        tooltipPlacement="bottom"
                        isManager={memberships.get(group.id)?.is_group_manager}
                        onChange={(is_group_manager: boolean) =>
                          handleChangeMembership(group.id, { is_group_manager })
                        }
                      />
                    )}
                    <span
                      style={{ visibility: isMember ? "visible" : "hidden" }}
                    >
                      <Icon name="check" />
                    </span>
                  </MembershipActionsContainer>
                </MembershipSelectItem>
              );
            })}
          </Fragment>
        ))}
      </MembershipSelectContainer>
    </PopoverWithTrigger>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MembershipSelect;
