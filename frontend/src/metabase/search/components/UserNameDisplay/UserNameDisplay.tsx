import { useAsync } from "react-use";
import { t } from "ttag";

import { UserApi } from "metabase/services";
import { Text } from "metabase/ui";
import type { UserId, UserListResult } from "metabase-types/api";

export type UserNameDisplayProps = {
  userIdList: UserId[];
  label: string;
};

export const UserNameDisplay = ({
  userIdList,
  label,
}: UserNameDisplayProps) => {
  const { loading: isLoading, value } = useAsync<
    () => Promise<{ data: UserListResult[] }>
  >(UserApi.list);
  const users = value?.data ?? [];

  const selectedUserList = users.filter(user => userIdList.includes(user.id));

  const getDisplayValue = () => {
    if (isLoading) {
      return t`Loading…`;
    }

    if (selectedUserList.length === 0) {
      return label;
    }

    if (selectedUserList.length === 1) {
      return selectedUserList[0].common_name ?? t`1 user selected`;
    }

    return t`${selectedUserList.length} users selected`;
  };

  return (
    <Text c="inherit" weight={700} truncate>
      {getDisplayValue()}
    </Text>
  );
};
