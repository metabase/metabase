import type { UserListResult } from "metabase-types/api";

export const getUserDisplayName = (user: UserListResult) => {
  return (
    user.common_name ||
    `${[user.first_name, user.last_name].filter(Boolean).join(" ")}`
  );
};
