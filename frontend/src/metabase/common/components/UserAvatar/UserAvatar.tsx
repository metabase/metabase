import { initial, userInitials } from "metabase/common/utils/user";
import type { Group, User } from "metabase-types/api";

import type { AvatarProps } from "./UserAvatar.styled";
import { Avatar as StyledAvatar } from "./UserAvatar.styled";

interface UserAvatarProps extends AvatarProps {
  user: Partial<
    Pick<User, "first_name" | "last_name" | "email" | "common_name">
  >;
}

interface GroupProps {
  user: Group;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export function UserAvatar({ user, ...props }: UserAvatarProps | GroupProps) {
  return <StyledAvatar {...props}>{userInitials(user) || "?"}</StyledAvatar>;
}

export function Avatar({ children, ...props }: { children: string }) {
  return <StyledAvatar {...props}>{initial(children) ?? "?"}</StyledAvatar>;
}
