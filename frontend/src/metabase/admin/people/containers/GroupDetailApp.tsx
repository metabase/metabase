import { useEffect } from "react";
import type { WithRouterProps } from "react-router";

import { useGetPermissionsGroupQuery, useListUsersQuery } from "metabase/api";
import type { GroupId } from "metabase-types/api";

import { GroupDetail } from "../components/GroupDetail";

export const GroupDetailApp = ({
  params,
}: WithRouterProps<{ groupId: GroupId }>) => {
  const {
    data: group,
    isLoading: isGroupLoading,
    refetch,
  } = useGetPermissionsGroupQuery(params.groupId);
  const { data: users = { data: [] }, isLoading: isUserListLoading } =
    useListUsersQuery({});

  // a hack right now, since the permissions group needs to reload when we deactivate a user.
  // maybe we can add some tag invalidation to the deleteUser api endpoint
  useEffect(() => {
    if (users.data.length) {
      refetch();
    }
  }, [refetch, users.data.length]);

  if (!isGroupLoading && group && !isUserListLoading) {
    return <GroupDetail group={group} />;
  }
  return null;
};
