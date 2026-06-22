import { t } from "ttag";

import { useListUserRecipientsQuery } from "metabase/api";
import { Text } from "metabase/ui";
import type { UserId } from "metabase-types/api";

export type UserNameDisplayProps = {
  userIdList: UserId[];
  label: string;
};

export const UserNameDisplay = ({
  userIdList,
  label,
}: UserNameDisplayProps) => {
  const { isLoading, data } = useListUserRecipientsQuery();
  const users = data?.data ?? [];

  const selectedUserList = users.filter((user) => userIdList.includes(user.id));

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
    <Text c="inherit" fw={700} truncate>
      {getDisplayValue()}
    </Text>
  );
};
