import dayjs from "dayjs";
import { Fragment, useMemo } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import UserAvatar from "metabase/components/UserAvatar";
import Link, { ForwardRefLink } from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_ADMIN_USER_MENU_ITEMS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import {
  Box,
  Flex,
  Icon,
  Menu,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { Group, GroupId, Member, User } from "metabase-types/api";

import { userToColor } from "../colors";

import { MembershipSelect } from "./MembershipSelect";
import S from "./PeopleListRow.module.css";

const enablePasswordLoginKey = "enable-password-login";

interface PeopleListRowProps {
  user: User;
  showDeactivated: boolean;
  groups: Group[];
  userMemberships: Member[];
  isCurrentUser: boolean;
  isAdmin: boolean;
  onAdd: (groupId: GroupId) => void;
  onChange: (groupId: GroupId, membershipData: Partial<Member>) => void;
  onRemove: (groupId: GroupId) => void;
  isConfirmModalOpen: boolean;
}

export const PeopleListRow = ({
  user,
  showDeactivated,
  groups,
  userMemberships,
  isCurrentUser,
  isAdmin,
  onAdd,
  onRemove,
  onChange,
  isConfirmModalOpen,
}: PeopleListRowProps) => {
  const membershipsByGroupId = useMemo(
    () =>
      userMemberships?.reduce((acc, membership) => {
        acc.set(membership.group_id, membership);
        return acc;
      }, new Map()),
    [userMemberships],
  );

  const isLoadingGroups = !groups;

  const isPasswordLoginEnabled = useSelector((state) =>
    getSetting(state, enablePasswordLoginKey),
  );

  return (
    <tr key={user.id}>
      <Flex component="td" align="center" gap="md" c="text-white">
        <UserAvatar bg={userToColor(user)} user={user} />
        <Text fw="700">{getName(user)}</Text>
      </Flex>
      <td>
        {user.sso_source === "google" ? (
          <Tooltip label={t`Signed up via Google`}>
            <Icon name="google" />
          </Tooltip>
        ) : null}
        {user.sso_source === "ldap" ? (
          <Tooltip label={t`Signed up via LDAP`}>
            <Icon name="ldap" />
          </Tooltip>
        ) : null}
      </td>
      <td>{user.email}</td>
      {showDeactivated ? (
        <Fragment>
          <td>{dayjs(user.updated_at).fromNow()}</td>
          <td>
            <Tooltip label={t`Reactivate this account`}>
              <Link to={Urls.reactivateUser(user.id)} className={S.refreshLink}>
                <Icon name="refresh" size={20} />
              </Link>
            </Tooltip>
          </td>
        </Fragment>
      ) : (
        <Fragment>
          <td>
            {isLoadingGroups ? (
              <LoadingSpinner />
            ) : (
              <MembershipSelect
                groups={groups}
                memberships={membershipsByGroupId}
                isCurrentUser={isCurrentUser}
                isUserAdmin={user.is_superuser}
                onAdd={onAdd}
                onRemove={onRemove}
                onChange={onChange}
                isConfirmModalOpen={isConfirmModalOpen}
              />
            )}
          </td>
          <td>
            {user.last_login ? dayjs(user.last_login).fromNow() : t`Never`}
          </td>
          <Box component="td" ta="right">
            {isAdmin && (
              <Menu shadow="md" position="bottom-end">
                <Menu.Target>
                  <UnstyledButton>
                    <Icon name="ellipsis" />
                  </UnstyledButton>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Item
                    component={ForwardRefLink}
                    to={Urls.editUser(user.id)}
                  >
                    {t`Edit user`}
                  </Menu.Item>

                  {isPasswordLoginEnabled && (
                    <Menu.Item
                      component={ForwardRefLink}
                      to={Urls.resetPassword(user.id)}
                    >
                      {t`Reset password`}
                    </Menu.Item>
                  )}

                  {PLUGIN_ADMIN_USER_MENU_ITEMS.flatMap((getItems) =>
                    getItems(user),
                  )}

                  {!isCurrentUser && (
                    <Menu.Item
                      component={ForwardRefLink}
                      to={Urls.deactivateUser(user.id)}
                    >
                      {t`Deactivate user`}
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Box>
        </Fragment>
      )}
    </tr>
  );
};

function getName(user: User): string {
  const name = getFullName(user);

  if (!name) {
    return "-";
  }

  return name;
}
