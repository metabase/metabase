import { t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { Text } from "metabase/ui";
import type { UserId } from "metabase-types/api";

export type UserNameDisplayProps = {
  userId: UserId | null;
  label: string;
};

export const UserNameDisplay = ({ userId, label }: UserNameDisplayProps) => {
  const { data: users = [], isLoading } = useUserListQuery();

  const user = userId && users.find(user => user.id === userId);

  const getDisplayValue = () => {
    if (isLoading) {
      return t`Loading…`;
    }

    if (!userId) {
      return label;
    }

    if (user && user.common_name) {
      return user.common_name;
    }

    return t`1 user selected`;
  };

  return (
    <Text c="inherit" weight={700} truncate>
      {getDisplayValue()}
    </Text>
  );
};
