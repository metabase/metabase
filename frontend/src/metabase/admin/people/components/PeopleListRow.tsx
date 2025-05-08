import cx from "classnames";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { Fragment, useMemo } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import UserAvatar from "metabase/components/UserAvatar";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_ADMIN_USER_MENU_ITEMS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Icon, Tooltip } from "metabase/ui";
import type { Group, GroupId, Member, User } from "metabase-types/api";

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
      <td className={cx(CS.flex, CS.alignCenter)}>
        <span className={cx(CS.textWhite, CS.inlineBlock)}>
          <UserAvatar
            bg={user.is_superuser ? color("accent2") : color("brand")}
            user={user}
          />
        </span>{" "}
        <span className={cx(CS.ml2, CS.textBold)}>{getName(user)}</span>
      </td>
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
          <td>{moment(user.updated_at).fromNow()}</td>
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
            {user.last_login ? moment(user.last_login).fromNow() : t`Never`}
          </td>
          <td className={CS.textRight}>
            {isAdmin && (
              <EntityMenu
                triggerIcon="ellipsis"
                items={[
                  {
                    title: t`Edit user`,
                    link: Urls.editUser(user.id),
                  },
                  isPasswordLoginEnabled && {
                    title: t`Reset password`,
                    link: Urls.resetPassword(user.id),
                  },
                  ...PLUGIN_ADMIN_USER_MENU_ITEMS.flatMap((getItems) =>
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

function getName(user: User): string {
  const name = getFullName(user);

  if (!name) {
    return "-";
  }

  return name;
}
