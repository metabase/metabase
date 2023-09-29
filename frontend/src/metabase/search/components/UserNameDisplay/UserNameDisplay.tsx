import { t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { Text } from "metabase/ui";
import type { UserId } from "metabase-types/api";

export type UserNameDisplayProps = {
  value: UserId | null;
  title: string;
};

export const UserNameDisplay = ({ value, title }: UserNameDisplayProps) => {
  const { data: users = [], isLoading } = useUserListQuery();

  const user = value && users.find(user => user.id === value);

  const getDisplayValue = () => {
    if (isLoading) {
      return t`Loading…`;
    }

    if (!value) {
      return title;
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
