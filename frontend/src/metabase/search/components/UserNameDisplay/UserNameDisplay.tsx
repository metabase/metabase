import { t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
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
  const { data: users = [], isLoading } = useUserListQuery();

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
