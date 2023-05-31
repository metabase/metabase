/* eslint-disable react/prop-types */
import { Fragment, useMemo } from "react";
import { t } from "ttag";
import moment from "moment-timezone";

import { color } from "metabase/lib/colors";
import { getFullName } from "metabase/lib/user";
import * as Urls from "metabase/lib/urls";

import EntityMenu from "metabase/components/EntityMenu";
import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/core/components/Tooltip";
import UserAvatar from "metabase/components/UserAvatar";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { PLUGIN_ADMIN_USER_MENU_ITEMS } from "metabase/plugins";
import MembershipSelect from "./MembershipSelect";

const PeopleListRow = ({
  user,
  showDeactivated,
  groups,
  userMemberships,
  isCurrentUser,
  isAdmin,
  onAdd,
  onRemove,
  onChange,
}) => {
  const membershipsByGroupId = useMemo(
    () =>
      userMemberships?.reduce((acc, membership) => {
        acc.set(membership.group_id, membership);
        return acc;
      }, new Map()),
    [userMemberships],
  );

  const isLoadingGroups = !groups;

  return (
    <tr key={user.id}>
      <td className="flex align-center">
        <span className="text-white inline-block">
          <UserAvatar
            bg={user.is_superuser ? color("accent2") : color("brand")}
            user={user}
          />
        </span>{" "}
        <span className="ml2 text-bold">{getName(user)}</span>
      </td>
      <td>
        {user.google_auth ? (
          <Tooltip tooltip={t`Signed up via Google`}>
            <Icon name="google" />
          </Tooltip>
        ) : null}
        {user.ldap_auth ? (
          <Tooltip tooltip={t`Signed up via LDAP`}>
            <Icon name="ldap" />
          </Tooltip>
        ) : null}
      </td>
      <td>{user.email}</td>
      {showDeactivated ? (
        <Fragment>
          <td>{moment(user.updated_at).fromNow()}</td>
          <td>
            <Tooltip tooltip={t`Reactivate this account`}>
              <Link to={Urls.reactivateUser(user.id)}>
                <Icon
                  name="refresh"
                  className="text-light text-brand-hover cursor-pointer"
                  size={20}
                />
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
              />
            )}
          </td>
          <td>
            {user.last_login ? moment(user.last_login).fromNow() : t`Never`}
          </td>
          <td className="text-right">
            {isAdmin && (
              <EntityMenu
                triggerIcon="ellipsis"
                items={[
                  {
                    title: t`Edit user`,
                    link: Urls.editUser(user.id),
                  },
                  {
                    title: t`Reset password`,
                    link: Urls.resetPassword(user.id),
                  },
                  ...PLUGIN_ADMIN_USER_MENU_ITEMS.flatMap(getItems =>
                    getItems(user),
                  ),
                  !isCurrentUser && {
                    title: t`Deactivate user`,
                    link: Urls.deactivateUser(user.id),
                  },
                ]}
              />
            )}
          </td>
        </Fragment>
      )}
    </tr>
  );
};

/**
 *
 * @param {import("metabase-types/api").User} user
 * @returns {string}
 */
function getName(user) {
  const name = getFullName(user);

  if (!name) {
    return "-";
  }

  return name;
}

export default PeopleListRow;
