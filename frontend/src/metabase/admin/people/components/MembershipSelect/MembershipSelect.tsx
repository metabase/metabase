import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import {
  getGroupNameLocalized,
  isAdminGroup,
  isDataAnalystGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_GROUP_MANAGERS, PLUGIN_TENANTS } from "metabase/plugins";
import { Box, Divider, Flex, Icon, Popover } from "metabase/ui";
import type { GroupInfo, Member } from "metabase-types/api";

import { GroupSummary } from "../GroupSummary";

import S from "./MembershipSelect.module.css";

const getGroupSections = (groups: GroupInfo[]) => {
  const defaultGroup = groups.find(
    (g) => isDefaultGroup(g) || PLUGIN_TENANTS.isExternalUsersGroup(g),
  );
  const adminGroup = groups.find(isAdminGroup);
  const dataAnalystGroup = groups.find(isDataAnalystGroup);
  const pinnedGroups = [defaultGroup, adminGroup, dataAnalystGroup].filter(
    isNotNull,
  );
  const regularGroups = groups.filter(
    (group) =>
      !isAdminGroup(group) &&
      !isDataAnalystGroup(group) &&
      !isDefaultGroup(group) &&
      !PLUGIN_TENANTS.isExternalUsersGroup(group),
  );

  return { pinnedGroups, regularGroups };
};

type Memberships = Map<GroupInfo["id"], Partial<Member>>;

interface MembershipSelectProps {
  groups: GroupInfo[];
  memberships: Memberships;
  isCurrentUser?: boolean;
  isUserAdmin: boolean;
  emptyListMessage?: string;
  onAdd: (groupId: number, membershipData: Partial<Member>) => void;
  onRemove: (groupId: number) => void;
  onChange: (groupId: number, membershipData: Partial<Member>) => void;
  isConfirmModalOpen?: boolean;
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
  isConfirmModalOpen,
}: MembershipSelectProps) => {
  const [popoverOpened, { open: openPopover, toggle: togglePopover }] =
    useDisclosure();
  const selectedGroupIds = Array.from(memberships.keys());
  const { pinnedGroups, regularGroups } = useMemo(
    () => getGroupSections(groups),
    [groups],
  );

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

  const renderGroup = (group: GroupInfo) => {
    const isDisabled =
      (isAdminGroup(group) && isCurrentUser) ||
      isDefaultGroup(group) ||
      PLUGIN_TENANTS.isExternalUsersGroup(group);
    const isMember = memberships.has(group.id);
    const canEditMembershipType =
      isMember &&
      !isUserAdmin &&
      !isDisabled &&
      !PLUGIN_TENANTS.isTenantGroup(group) &&
      !isAdminGroup(group);

    return (
      <li
        className={S.membershipSelectItem}
        key={group.id}
        aria-label={group.name}
        onClick={() =>
          isDisabled ? undefined : handleToggleMembership(group.id)
        }
        style={{ cursor: isDisabled ? "not-allowed" : "pointer" }}
      >
        <span>{getGroupNameLocalized(group)}</span>
        <Flex pl="md" align="center" justify="end">
          {canEditMembershipType && (
            <PLUGIN_GROUP_MANAGERS.UserTypeToggle
              tooltipPlacement="bottom"
              isManager={memberships.get(group.id)?.is_group_manager}
              onChange={(is_group_manager: boolean) =>
                handleChangeMembership(group.id, {
                  is_group_manager,
                })
              }
            />
          )}
          <span
            style={{
              visibility: isMember ? "visible" : "hidden",
            }}
          >
            <Icon name="check" />
          </span>
        </Flex>
      </li>
    );
  };

  return (
    <Popover
      opened={popoverOpened}
      // prevent clicks on the confirm modal from closing this popover
      closeOnClickOutside={!isConfirmModalOpen}
      onChange={togglePopover}
      position="bottom-start"
    >
      <Popover.Target>
        <Flex
          display="inline-flex"
          onClick={openPopover}
          align="center"
          aria-label="group-summary"
        >
          <GroupSummary
            me="sm"
            groups={groups}
            selectedGroupIds={selectedGroupIds}
          />
          <Icon c="text-tertiary" name="chevrondown" size={10} />
        </Flex>
      </Popover.Target>
      <Popover.Dropdown w="300px" mah="600px" py="sm">
        {groups.length === 0 && (
          <Box component="span" p="sm">
            {emptyListMessage}
          </Box>
        )}

        {pinnedGroups.length > 0 && (
          <ul>
            {pinnedGroups.map((group) => {
              return renderGroup(group);
            })}
          </ul>
        )}

        {regularGroups.length > 0 && (
          <>
            <Divider my="sm" />
            <ul>
              {regularGroups.map((group) => {
                return renderGroup(group);
              })}
            </ul>
          </>
        )}
      </Popover.Dropdown>
    </Popover>
  );
};
