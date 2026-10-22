import cx from "classnames";

import {
  type PartialGroup,
  type PartialTenant,
  type PartialUser,
  prepareInitials,
} from "metabase/common/utils/user";
import { Center } from "metabase/ui";

import S from "./UserAvatar.module.css";

interface AvatarProps {
  bg?: string;
  className?: string;
}

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
  bg,
  className,
}: UserAvatarProps | GroupProps | TenantProps) {
  return (
    <Center
      className={cx(S.avatar, className)}
      c="text-primary-inverse"
      fw={900}
      lh={1}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {prepareInitials(user) || "?"}
    </Center>
  );
}
