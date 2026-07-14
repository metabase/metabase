import {
  type PartialGroup,
  type PartialTenant,
  type PartialUser,
  prepareInitials,
} from "metabase/common/utils/user";

import type { AvatarProps } from "./UserAvatar.styled";
import { Avatar as StyledAvatar } from "./UserAvatar.styled";

interface UserAvatarProps extends AvatarProps {
  user: PartialUser;
}

interface GroupProps extends AvatarProps {
  user: PartialGroup;
}

interface TenantProps extends AvatarProps {
  user: PartialTenant;
}

export function UserAvatar({
  user,
  ...props
}: UserAvatarProps | GroupProps | TenantProps) {
  return <StyledAvatar {...props}>{prepareInitials(user) || "?"}</StyledAvatar>;
}
