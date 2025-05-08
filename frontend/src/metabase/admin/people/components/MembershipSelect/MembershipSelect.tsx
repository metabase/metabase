import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { Fragment } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { Icon, Popover } from "metabase/ui";
import type { Group, Member } from "metabase-types/api";

import { GroupSummary } from "../GroupSummary";

import S from "./MembershipSelect.module.css";

const getGroupSections = (groups: Omit<Group, "members">[]) => {
  const defaultGroup = groups.find(isDefaultGroup);
  const adminGroup = groups.find(isAdminGroup);
  const pinnedGroups = [defaultGroup, adminGroup].filter(isNotNull);
  const regularGroups = groups.filter(
    (group) => !isAdminGroup(group) && !isDefaultGroup(group),
  );

  if (pinnedGroups.length > 0) {
    return [
      { groups: pinnedGroups },
      { groups: regularGroups, header: t`Groups` },
    ];
  }

  return [{ groups: regularGroups }];
};

type Memberships = Map<Group["id"], Partial<Member>>;

interface MembershipSelectProps {
  groups: Omit<Group, "members">[];
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
    <Popover
      opened={popoverOpened}
      // prevent clicks on the confirm modal from closing this popover
      closeOnClickOutside={!isConfirmModalOpen}
      onChange={togglePopover}
    >
      <Popover.Target>
        <div
          onClick={openPopover}
          className={cx(CS.flex, CS.alignCenter)}
          aria-label="group-summary"
        >
          <span className={cx(CS.mr1, CS.textMedium)}>
            <GroupSummary groups={groups} selectedGroupIds={selectedGroupIds} />
          </span>
          <Icon className={CS.textLight} name="chevrondown" size={10} />
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        {groups.length === 0 && (
          <span className={CS.p1}>{emptyListMessage}</span>
        )}
        {groups.length > 0 && (
          <ul className={S.membershipSelectContainer}>
            {groupSections.map((section, index) => (
              <Fragment key={index}>
                {section.header && (
                  <li className={S.membershipSelectHeader}>{section.header}</li>
                )}
                {section.groups.map((group) => {
                  const isDisabled =
                    (isAdminGroup(group) && isCurrentUser) ||
                    isDefaultGroup(group);
                  const isMember = memberships.has(group.id);
                  const canEditMembershipType =
                    isMember &&
                    !isUserAdmin &&
                    !isDisabled &&
                    !isAdminGroup(group);

                  return (
                    <li
                      className={cx(S.membershipSelectItem, {
                        [S.membershipSelectItemDisabled]: isDisabled,
                      })}
                      key={group.id}
                      aria-label={group.name}
                      onClick={() =>
                        isDisabled
                          ? undefined
                          : handleToggleMembership(group.id)
                      }
                    >
                      <span>{getGroupNameLocalized(group)}</span>
                      <div className={S.membershipActionsContainer}>
                        {canEditMembershipType && (
                          <PLUGIN_GROUP_MANAGERS.UserTypeToggle
                            tooltipPlacement="bottom"
                            isManager={
                              memberships.get(group.id)?.is_group_manager
                            }
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
                      </div>
                    </li>
                  );
                })}
              </Fragment>
            ))}
          </ul>
        )}
      </Popover.Dropdown>
    </Popover>
  );
};
