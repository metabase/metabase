import cx from "classnames";
import { Fragment, useEffect } from "react";
import { msgid, ngettext, t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import type { UsePeopleQueryPayload } from "metabase/admin/people/hooks/use-people-query";
import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import {
  PaginationControls,
  type PaginationControlsProps,
} from "metabase/components/PaginationControls";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import type { GroupId, Member, User, UserId } from "metabase-types/api";

import { USER_STATUS } from "../constants";
import {
  createMembership,
  deleteMembership,
  loadMemberships,
  updateMembership,
} from "../people";
import { getMembershipsByUser } from "../selectors";

import PeopleListRow from "./PeopleListRow";

export const PeopleList = ({
  query: { page, pageSize, searchText, status },
  onNextPage,
  onPreviousPage,
}: Pick<PaginationControlsProps, "onPreviousPage" | "onNextPage"> & {
  query: UsePeopleQueryPayload;
}) => {
  const dispatch = useDispatch();

  const { data: groups = [] } = useListPermissionsGroupsQuery();
  const {
    data: userResponse = {
      data: [],
      limit: null,
      offset: null,
      total: 0,
    },
  } = useListUsersQuery({
    query: searchText,
    status: status,
    limit: pageSize,
    offset: pageSize * page,
  });

  const { data: users, total } = userResponse;

  const currentUser = useSelector(getCurrentUser);
  const isAdmin = useSelector(getUserIsAdmin);
  const membershipsByUser: Record<UserId, Member[]> =
    useSelector(getMembershipsByUser);

  const { modalContent, show } = useConfirmation();

  useEffect(() => {
    dispatch(loadMemberships());
  }, [dispatch]);

  const isCurrentUser = (u: User) => currentUser?.id === u.id;
  const showDeactivated = status === USER_STATUS.deactivated;
  const hasUsers = users.length > 0;

  const handleChange = async (
    groupId: GroupId,
    membershipData: Member,
    userId: UserId,
  ) => {
    const membership = membershipsByUser[userId].find(
      membership => membership.group_id === groupId,
    );
    const updatedMembership = {
      ...membership,
      ...membershipData,
    };

    const confirmation = PLUGIN_GROUP_MANAGERS.getChangeMembershipConfirmation(
      currentUser,
      updatedMembership,
    );

    if (!confirmation) {
      await dispatch(updateMembership(updatedMembership));

      return;
    }

    show({
      ...confirmation,
      onConfirm: async () => {
        await dispatch(
          PLUGIN_GROUP_MANAGERS.confirmUpdateMembershipAction(
            updatedMembership,
            membershipsByUser[currentUser.id],
            "people",
          ),
        );
      },
    });
  };

  const handleRemove = async (groupId: GroupId, userId: UserId) => {
    const membershipId = membershipsByUser[userId].find(
      membership => membership.group_id === groupId,
    )?.membership_id;

    if (!membershipId) {
      return;
    }

    const confirmation = PLUGIN_GROUP_MANAGERS.getRemoveMembershipConfirmation(
      currentUser,
      membershipsByUser[currentUser.id],
      membershipId,
    );

    if (!confirmation) {
      await dispatch(deleteMembership(membershipId));

      return;
    }

    show({
      ...confirmation,
      onConfirm: async () => {
        await dispatch(
          PLUGIN_GROUP_MANAGERS.confirmDeleteMembershipAction(
            membershipId,
            membershipsByUser[currentUser.id],
            "people",
          ),
        );
      },
    });
  };

  const handleAdd = async (groupId: GroupId, userId: UserId) => {
    await dispatch(createMembership({ groupId, userId }));
  };

  return (
    <section className={CS.pb4}>
      <table
        data-testid="admin-people-list-table"
        className={cx(AdminS.ContentTable, CS.borderBottom)}
      >
        <thead>
          <tr>
            <th>{t`Name`}</th>
            <th />
            <th>{t`Email`}</th>
            {showDeactivated ? (
              <Fragment>
                <th>{t`Deactivated`}</th>
                <th />
              </Fragment>
            ) : (
              <Fragment>
                <th>{t`Groups`}</th>
                <th>{t`Last Login`}</th>
                <th />
              </Fragment>
            )}
          </tr>
        </thead>
        <tbody>
          {hasUsers &&
            users.map(user => (
              <PeopleListRow
                key={user.id}
                user={user}
                showDeactivated={showDeactivated}
                groups={groups}
                userMemberships={membershipsByUser[user.id]}
                isCurrentUser={isCurrentUser(user)}
                isAdmin={isAdmin}
                onAdd={(groupId: GroupId) => handleAdd(groupId, user.id)}
                onRemove={(groupId: GroupId) => handleRemove(groupId, user.id)}
                onChange={(groupId: GroupId, membershipData: Member) =>
                  handleChange(groupId, membershipData, user.id)
                }
              />
            ))}
        </tbody>
      </table>

      {hasUsers && (
        <div
          className={cx(CS.flex, CS.alignCenter, CS.justifyBetween, CS.p2)}
          data-testid="people-list-footer"
        >
          <div className={cx(CS.textMedium, CS.textBold)}>
            {ngettext(
              msgid`${total} person found`,
              `${total} people found`,
              total,
            )}
          </div>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            itemsLength={users.length}
            onNextPage={onNextPage}
            onPreviousPage={onPreviousPage}
          />
        </div>
      )}

      {!hasUsers && (
        <div
          className={cx(
            CS.flex,
            CS.flexColumn,
            CS.alignCenter,
            CS.justifyCenter,
            CS.p4,
            CS.textMedium,
            CS.textCentered,
          )}
        >
          <div className={CS.my3}>
            <Icon name="search" className={CS.mb1} size={32} />
            <h3 className={CS.textLight}>{t`No results found`}</h3>
          </div>
        </div>
      )}

      {modalContent}
    </section>
  );
};
