/* eslint-disable react/prop-types */
import { t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { Text } from "metabase/ui";
import type { UserId } from "metabase-types/api";

export const UserNameDisplay = ({
  value,
  title,
}: {
  value: UserId | null;
  title: string;
}) => {
  const { data: users = [], isLoading } = useUserListQuery();

  const user = value && users.find(user => user.id === value);

  const getDisplayValue = () => {
    if (isLoading) {
      return t`Loading…`;
    }

    if (!value) {
      return title;
    }

    return user ? user.common_name : t`1 user selected`;
  };

  return (
    <Text c="inherit" weight={700} truncate>
      {getDisplayValue()}
    </Text>
  );
};
