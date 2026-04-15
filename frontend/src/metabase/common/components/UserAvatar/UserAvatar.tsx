import {
  type PartialGroup,
  type PartialUser,
  initial,
  userInitials,
} from "metabase/common/utils/user";

import type { AvatarProps } from "./UserAvatar.styled";
import { Avatar as StyledAvatar } from "./UserAvatar.styled";

interface UserAvatarProps extends AvatarProps {
  user: PartialUser;
}

interface GroupProps {
  user: PartialGroup;
}

export function UserAvatar({ user, ...props }: UserAvatarProps | GroupProps) {
  return <StyledAvatar {...props}>{userInitials(user) || "?"}</StyledAvatar>;
}

export function Avatar({ children, ...props }: { children: string }) {
  return <StyledAvatar {...props}>{initial(children) ?? "?"}</StyledAvatar>;
}
