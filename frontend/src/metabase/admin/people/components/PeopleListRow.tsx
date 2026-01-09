import dayjs from "dayjs";
import { Fragment, useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import UserAvatar from "metabase/common/components/UserAvatar";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_ADMIN_USER_MENU_ITEMS, PLUGIN_TENANTS } from "metabase/plugins";
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
import type {
  GroupId,
  GroupInfo,
  Member,
  Membership,
  User,
} from "metabase-types/api";

import { userToColor } from "../colors";

import { MembershipSelect } from "./MembershipSelect";
import { ReactivateUserButton } from "./ReactivateUserButton";

const enablePasswordLoginKey = "enable-password-login";

interface PeopleListRowProps {
  user: User;
  showDeactivated: boolean;
  groups: GroupInfo[];
  userMemberships: Membership[];
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
  const isExternal = !!user.tenant_id;
  const membershipsByGroupId = useMemo(
    () =>
      userMemberships?.reduce((acc, membership) => {
        acc.set(membership.group_id, membership);
        return acc;
      }, new Map()),
    [userMemberships],
  );

  const isPasswordLoginEnabled = useSelector((state) =>
    getSetting(state, enablePasswordLoginKey),
  );

  return (
    <tr key={user.id}>
      <Flex component="td" align="center" gap="md" c="text-primary-inverse">
        <UserAvatar bg={userToColor(user)} user={user} />
        <Text fw="700">{getFullName(user) ?? "-"}</Text>
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
          {isExternal && (
            <td>
              <PLUGIN_TENANTS.TenantDisplayName id={user.tenant_id} />
            </td>
          )}
          <td>{dayjs(user.updated_at).fromNow()}</td>
          <td>
            {isExternal ? (
              <PLUGIN_TENANTS.ReactivateExternalUserButton user={user} />
            ) : (
              <ReactivateUserButton user={user} />
            )}
          </td>
        </Fragment>
      ) : (
        <Fragment>
          <td>
            {isExternal ? (
              <PLUGIN_TENANTS.TenantDisplayName id={user.tenant_id} />
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
                    to={Urls.editUser(user)}
                  >
                    {t`Edit user`}
                  </Menu.Item>

                  {isPasswordLoginEnabled && (
                    <Menu.Item
                      component={ForwardRefLink}
                      to={Urls.resetPassword(user)}
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
                      to={Urls.deactivateUser(user)}
                      c="danger"
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
